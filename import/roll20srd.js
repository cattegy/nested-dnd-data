/**
 * Roll 20 SRD Compendium Importer and Processor
 * ------------------------------------
 * uses roll20's api for the 5e SRD and processes it
 */
let fs = require('fs'),
	https = require('https'),
	mkdirp = require('mkdirp'),
	$ = require('jquery'),
	getDirName = require('path').dirname;
	//Ajv = require('ajv'),
	//schema_all = require('5e-json-schema/5e_all.json');

var ajvOptions = {
	schemaId: "$id",
	verbose: true,
	schemas: [
		require('5e-json-schema/class.json'),
		require('5e-json-schema/definitions.json'),
		require('5e-json-schema/spell.json'),
		require('5e-json-schema/item.json'),
		require('5e-json-schema/feat.json'),
		require('5e-json-schema/monster.json'),
		require('5e-json-schema/race.json')
	],
	allErrors: true,
}

/*var validator = new Ajv(ajvOptions);

ajvOptions.removeAdditional = "all";
var cleanup_validator = new Ajv(ajvOptions);*/

class Importer {
	constructor(pagename, url, callback){
		this.pagename = pagename;
		this.mainUrl = url; // main list page
		this.callback = callback;
		this.urls = [];
		this.data = {};
		this.loading = [];

		// store the known values of roll20, so if they add to their data we can track it
		this.known_spell_props = [
			"id", "name","content","htmlcontent","data",
			"Category",
			"Classes",

			"Level","Range","School","Source","Duration",
			"Components","Casting Time",
			"Material",
			"Ritual",
			"Concentration",
			
			"Save",
			"Saving Throws", //same as above
			"Save Success", //example: Half Damage
			
			"Target", //example: Black Tentacles
			"Add Casting Modifier", //Cure Wounds
			"Spell Attack", //Ranged

			"Damage", //look at Acid Arrow
			"Damage Type",
			"Healing",

			"Damage Progression",  //Cantrip Dice (Acid Splash), Cantrip Beams (Eldritch Blast)
			"Higher Level Healing", //example:Heal
			"Higher Spell Slot Die",
			"Higher Spell Slot Dice",
			"Higher Spell Slot Bonus", //example: Magic Missle
			
			"Secondary Damage",
			"Secondary Damage Type",
			"Secondary Higher Spell Slot Dice",
			"Secondary Higher Spell Slot Die",
			
		];
		this.damage_prog_enum = ["Cantrip Dice","Cantrip Beams"];
	}

	run() {
		console.log("Begin "+this.pagename+" import");

		var importer = this;

		return fs.readFile('cache/roll20/'+this.pagename+'.html', 'utf8', (err, html) => {
		  if (err) {
		  	return https.get(importer.mainUrl, function(response) {
					console.log("loaded "+importer.pagename+" page from roll20");
					var html = '';

					response.on('data', function (chunk) {
						html += chunk;
					});

					response.on('end', function () {
						writeFile('cache/roll20/'+importer.pagename+'.html',html);
						importer.extractUrls(html);
					}); //on end response
				});//https get
		  }

		  importer.extractUrls(html);
		});

	}//run

	extractUrls(html){
		var importer = this;
		var selector = (this.pagename == "Items") ? '[data-pageid] li a' : "[data-pageid] a";
		$(html).find(selector).each(function() {
			importer.urls.push(this.href);
		});

		console.log("found "+this.urls.length+" "+this.pagename);
	
		var name;
		for (var i = 0, url; url = this.urls[i]; i++) {
			url = url.substring(0, url.indexOf("#"));
			url = "https://roll20.net"+url;

			name = url.replace("https://roll20.net/compendium/dnd5e/"+this.pagename+":","");
			name = decodeURIComponent(name);
			this.getSingleItem(url,name);
		}
	}

	//todo: get rid of name and 
	cleanData(){
		var schema;
		var obj = {}

		if(this.pagename == "Spells"){
			obj = {
				spells: Object.keys(this.data).map((k) => this.data[k])
			}
		}
		var check = cleanup_validator.compile(schema_all);
		if(!check(obj)){
			console.log(check.errors);
		}
		return obj;
	}


	validate(){
		var schema;
		var obj = {}

		if(this.pagename == "Spells"){
			obj = {
				spells: Object.keys(this.data).map((k) => this.data[k])
			}
		}

		var check = validator.compile(schema_all);
		if(!check(this.data)){
			console.log(check.errors);
		}
		return obj;
	}

	getSingleItem(url, name){
		//don't get urls you've already gotten
		if(this.data[name]){
			return;
		}
		if(!this.loading.includes(name)){
			this.loading.push(name);
		}

		return fs.readFile('cache/roll20/'+this.pagename+'/'+name+'.json', 'utf8', (err, json) => {
			var importer = this;

			if(!err){
				if(importer.pagename == "Spells")
					return importer.parseSpell(json);
				if(importer.pagename == "Monsters")
					return importer.parseMonster(json);
				if(importer.pagename == "Items")
					return importer.parseItems(json);
			}
			
			return https.get(url+".json", function(response) {
				var json = '';

				response.on('data', function (chunk) {
					json += chunk;
				});

				response.on('error',function(error){
					console.log("error",error);
				});

				response.on('end', function () {
					writeFile('cache/roll20/'+importer.pagename+'/'+name+'.json',json);
					if(importer.pagename == "Spells")
						return importer.parseSpell(json);
					if(importer.pagename == "Monsters")
						return importer.parseMonster(json);
					if(importer.pagename == "Items")
						return importer.parseItems(json);
				})//response on end
			}).on('error',function(error){
				console.log("error",error);
				//retry
				setTimeout(importer.getSingleItem.bind(importer,url,name), 200);
			});//https
		});
	}

	parseItems(str){
		try{
			var json = JSON.parse(str);
		}
		catch(e){
			console.log("error parsing json",e);
		}
		//console.log(this.loading.length+") got "+json.name);
		this.loading.splice(this.loading.indexOf(json.name),1);

		if(!json.name){
			console.log("couldn't find name in return data for item "+name+" or name doesn't match.");
			return;
		}

		var item = json;
		var properties = {};
		var name = item.name;
		var benefits = [];

		if(typeof item.htmlcontent == "undefined")
			return;
		console.log(">> "+name.toUpperCase());

		var html = item.htmlcontent.replace(/\r?\n|\r/g,"");

		if(html.endsWith("<br><br>")){
			html = html.substring(0, html.length-8);
		}
		if(html.includes("<br>")){
			html = html.replace(/<br><br>/g,"<br>").replace(/<br>/g,"<p>");
		}
		if(html.includes("<li>")){
			html = html.replace(/:/g," -").replace(/<li>/g," ").replace(/<\/li>/g,"").replace(/<ul>/g,"").replace(/<\/ul>/g,"");
		}
		html = html.replace(/<\/p>/g,"");

		var parts = html.split("<p>");
		var label = null;
		var unusedLabel = false;

		for(var i = 0; i < parts.length; i++){
			var part = parts[i];

			if(part.toLowerCase() == "requires attunement"){
				item.data.attuned = true;
				continue;
			}
			if(part.startsWith("Ammunition")){
				item.data.isAmmunition = true;
				continue;
			}
			if(part.startsWith("If you use a weapon that has the ammunition property")){
				item.data.isAmmunition = true;
				continue;
			}
			if(part.toLowerCase().includes("requires attunement")){
				part = part.replace(/\(requires attunement\)/ig, "");
				item.data.attuned = true;
			}
			if(part.startsWith("</")){
				part = part.substring(part.indexOf(">")+1);
			}
			if(part.startsWith("<p>") && part.match("<p>").length == 1){
				part = part.replace("<p>","");
			}
			if(part.startsWith("<strong>")){
				if(!part.includes("</strong>")){
					part = part+"</strong>";
				}
				var re = /<strong>(.*)<\/strong>/;

				if(unusedLabel){ //append to previous
					throw "didn't find use for label "+label;
				}

				label = part.match(re)[1];
				part = part.replace("<strong>"+label+"</strong>","");
				if(label.endsWith(".")){
					label = label.substring(0,label.length-1);
				}
				if(part.startsWith(".")){
					part = part.substring(1);
				}
				if(part.includes(":")){
					part = label.trim() + part;
				}else{
					part = label.trim()+": "+part;
				}
				label = null;
			}
			if(part.includes("</strong>.") && !part.includes("<strong>")){
				part = part.replace("</strong>.",": ");
			}
			if(part.startsWith("<table>")){
				var $table = $(part);
				var data = [];
				var names = []

				if(!unusedLabel){
					label = $table.find("td")[0].textContent;
				}
				console.log("\t"+label);

				names = $table.find("tr").first().children().map(function(){
						 return $.trim($(this).text());
					}).get();
				
				$table.find("tr").each(function(){
					var row = {};
					$(this).children().each(function(index){
						row[names[index]] = $.trim($(this).text());
					});	
					data.push(row);
					console.log("\t\t"+JSON.stringify(row).substring(0,175));
				});

				if(label){
					if(!properties[label]) 
						properties[label] = 0;
					properties[label]++
					if(!item.data.detail) 
						item.data.detail = {};
					if(item.data.detail[label]){
						throw "there is already a thing here";
					}
					item.data.detail[label] = data;
					unusedLabel = false;
					label = null;
					continue;
				}
				throw "Unrecognized format";
			}
			if(part.charAt(0) == "<" && !part.startsWith("<em>")){
				throw "Unrecognized format";
			}
			if(!part.length){
				continue;
			}
			if(!item.data.attuned && part.toLowerCase().includes("attunement")){
				throw "unexpected attunement";
			}
			if(part.includes(" with the following statistics:")){
				part = part.replace(" with the following statistics:","");
			}
			if(part.startsWith("To be used as a vehicle, the apparatus requires one pilot")){
				label = null;
			}

			var labelEnd = part.indexOf(":");
			if(part.includes("•")) 
				labelEnd = -1;

			if(labelEnd != 1 && part.includes(".") &&  part.indexOf(".") < part.indexOf(":")){
				//only use the last sentence as a label
				var sentences = part.split(". ");

				var lastSentence = sentences.pop().trim();
				labelEnd = lastSentence.indexOf(":")

				if(labelEnd != -1){ //push previous sentences to description
					if(unusedLabel){
						throw "this is complicated";
					}
					var tempPart = sentences.join(". ");
					if(!item.data.description){
						item.data.description = [];
					}
					item.data.description.push(tempPart);
					console.log("\t"+tempPart.substring(0,175));

					part = lastSentence; //use last sentence
				}
			}
			
			if(labelEnd != -1){
				if(unusedLabel){ //append to previous
					label+= " - "+part.substring(0,labelEnd);
				}
				else{
					label = part.substring(0,labelEnd);
				}

				part = part.substring(labelEnd+1).trim();
				if(!label.length){
					throw "label has no length";
				}

				if(label.includes("wear") && (label.includes("ou gain the following benefits") || label.includes("ou gain these benefits"))){
					label = "Benefits while worn";
				}

				if(!part.length){ ///TODO: split on "."
					unusedLabel = true;
					continue;
				}
				
				if(label.startsWith("While")){
					part = label+": "+part;
					label = null;
				}else{
					console.log("\t"+label);
				
					if(!properties[label]) 
						properties[label] = 0;
					properties[label]++
					if(!item.data.detail) 
						item.data.detail = {};
					item.data.detail[label] = [];
				}
			}

			part = part.replace("•","").trim();

			if(label){

				label = label.trim();
				if(unusedLabel){
					console.log("\t"+label);
					if(label.includes("benefits") || label.includes("While")){
						benefits.push(label);
					}
					else{
						if(!properties[label]) 
							properties[label] = 0;
						properties[label]++
					}

					if(!item.data.detail) 
						item.data.detail = {};
					item.data.detail[label] = [];
				}
				
				item.data.detail[label].push(part);
				console.log("\t\t"+part.substring(0,175));
				unusedLabel = false;
				continue;
			}
			if(!item.data.description){
				item.data.description = [];
			}
			item.data.description.push(part);
			console.log("\t"+part.substring(0,175));
		}
		if(unusedLabel){
			throw "never found use for label "+label;
		}
		delete item.htmlcontent;
		delete item.data["Source"];
		delete item.data.id;

		//store the monster
		this.data[item.name] = item;


		//all done
		if(this.loading.length == 0){
			//this.validate();
			this.callback(this.data);
		}
	}

	parseMonster(str){
		try{
			var json = JSON.parse(str);
		}
		catch(e){
			console.log("error parsing json",e);
		}
		//console.log(this.loading.length+") got "+json.name);
		this.loading.splice(this.loading.indexOf(json.name),1);

		if(!json.name){
			console.log("couldn't find name in return data for item "+name+" or name doesn't match.");
			return;
		}

		var monster = json;
		monster.$schema  = "https://raw.githubusercontent.com/cattegy/5e-json-schema/master/monster_detail.json";
		var section = null;
		var sections = [];
		var name = monster.name;

		//TODO: move down
		if(monster.data.Languages)
			monster.languages = setMonsterLanugages(monster.data.Languages);
		getMonsterEnvironment(name);
		if(!monster.init){
			monster.init = getInitiative(monster["DEX"]);
		}

		if(typeof monster.htmlcontent == "undefined")
			return;

		var html = "<br>"+monster.htmlcontent.replace(/\r?\n|\r/g,"")+"<br>";
		//console.log(">> "+name.toUpperCase());

		var $html = $(html);

		var label = null;
		$html.each(function(index){
			if(this.nodeName == "H2"){
				if(section && !Object.keys(monster.data[section]).length){
					throw name+" couldn't find any data for "+section;
				}

				section = this.textContent;
				if(monster.data[section]){
					throw name+" already has "+section;
				}
				monster.data[section] = {};
				sections[section] = ""; 
				label = null;
				//console.log("    "+section);
			}
			else if(this.nodeName == "STRONG"){
				label = this.textContent.trim();
				var text = this.nextSibling.textContent.trim();
				if(text.charAt(0) == ":"){
					text = text.substring(1).trim();
				}

				if(!section){
					throw name+" can't find section for "+label;
				}
				if(!this.nextSibling){
					throw name+" can't find description for "+label+" in "+section;
				}
				if(this.nextSibling.nodeName != "#text"){
					throw name+" has unexpected format";
				}
				if(!label.length){
					throw name+": couldn't find description for item in "+section;
				}
				if(!text.length){
					throw name+": couldn't find description for "+label+" in "+section;
				}
				if(!monster.data[section]){
					throw name+" doesn't have a section defined before "+label;
				}

				if(monster.data[section][label]){
					console.warn(name+" already has a "+section+" named "+label);
					return;
				}
				monster.data[section][label] = "";
				//console.log("        "+label+": "+text);
			}else if(this.nodeName == "#text" || this.nodeName == "EM"){
				var text = this.outerHTML || this.textContent;
				text = text.trim();
				if(text.charAt(0) == ":" || text.charAt(0) == "."){
					text = text.substring(1).trim();
				}
				if(!text.length && label && !monster.data[section][label].length){
					throw name+": couldn't find description for "+label+" in "+section;
				}else if(!text.length){
					return;
				}

				if(!section){
					if(monster.data.description)
						monster.data.description+="<p>"+text;
					else
						monster.data.description = text;
					return;
				}
				if(!label){
					if(monster.data[section].description)
						monster.data[section].description+="<p>"+text;
					else
						monster.data.description = text;
					return;
				}

				if(monster.data[section][label] != "")
					monster.data[section][label]+= "<p>";
				
				monster.data[section][label]+= text;
			}else if(this.nodeName != "BR"){
				throw name+" has unexpected format";
			}
		});
		delete monster.data["Source"];
		delete monster.htmlcontent;
		delete monster.content;
		
		//store the monster
		this.data[monster.name] = monster;

		//setMonsterLanugages(monster.data.Languages);
		getMonsterEnvironment(name);
		if(!monster.init){
			monster.init = getInitiative(monster["DEX"]);
		}

		
		//all done
		if(this.loading.length == 0){
			//this.validate();
			this.callback(this.data);
		}
	}

	parseSpell(str){
		try{
			var json = JSON.parse(str);
		}
		catch(e){
			console.log("error parsing json",e);
		}
		console.log(this.loading.length+") got "+json.name);
		this.loading.splice(this.loading.indexOf(json.name),1);

		if(!json.name){
			console.log("couldn't find name in return data for item "+name+" or name doesn't match.");
			return;
		}

		//check for unknown values, so we can keep the schema accurate
		var dmg_prog = json.data["Damage Progression"]
		if(dmg_prog && !this.damage_prog_enum.includes(dmg_prog)){
			this.damage_prog_enum.push(dmg_prog);
			console.error("Unknown damage progression value: "+dmg_prog);
		}
		var importer = this;
		Object.keys(json).forEach(function(key){
			if(!importer.known_spell_props.includes(key)){
				console.error("Unknown data value: "+key);
				importer.known_spell_props.push(key);
			}
		})
		Object.keys(json.data).forEach(function(key){
			if(!importer.known_spell_props.includes(key)){
				console.error("Unknown data value: "+key);
				importer.known_spell_props.push(key);
			}
		})

		//always present values
		var spell = {
			"$schema": "https://raw.githubusercontent.com/cattegy/5e-json-schema/master/spell_detail.json",
			"name": json.name.trim(),
			"cast_time": json.data["Casting Time"].trim(),
			"classes": json.data.Classes.replace(/\s/g,"").split(","),
			"duration": json.data.Duration.trim(),
			"description_full": json.content.trim(),
			"level": parseInt(json.data.Level),
			"school": json.data.School.trim(),
			"sources": [
				json.data.Source.trim(),
				"https://roll20.net/compendium/dnd5e/"+encodeURIComponent(json.name)+".json",
			]
		};

		//sometimes included values
		if(json.data.Components){
			spell.components = {
				"types": json.data.Components.replace(/\s/g,"")
			}
			if(json.data.Material)
				spell.components.materials = json.data.Material;
		}
		if(json.data.Range){
			spell.range = json.data.Range;
		}
		if(json.data.Target){
			spell.target = json.data.Target;
		}
		if(json.data.Ritual){
			if(json.data.Ritual == "Yes")
				spell.ritual = true;
			else
				console.error("Unknown value for Ritual: "+json.data.Ritual);
		}

		if(json.data.Concentration){
			if(json.data.Concentration.toLowerCase() == "yes")
				spell.concentration = true;
			else
				console.error("Unknown value for Concentration: "+json.data.Concentration);
		}

		if(json.data.Se || json.data["Saving Throws"] || json.data["Save Success"]){
			spell.save = {
				"throw": json.data.Save ? json.data.Save : json.data["Saving Throws"],
				"success": json.data["Save Success"]
			}
		}

		// ----- Damage
		if(json.data.Damage){
			spell.dice = {
				roll: json.data.Damage,
				type: json.data["Damage Type"]
			};
			if(spell.dice.type.includes(" or ")){
				spell.dice.type = "Multiple"
			}
		}
		else if(json.data.Healing){
			spell.dice = {
				roll: json.data.Healing,
				type: "Healing"
			};
		}

		//casting modifier
		if(json.data["Add Casting Modifier"]){
			if(json.data["Add Casting Modifier"] == "Yes")
				spell.dice.add_modifier = true;
			else
				console.error("Unknown value for Add Casting Modifier: "+json.data["Add Casting Modifier"]);
		}

		//progression
		if(json.data["Damage Progression"]){
			spell.dice.progression = spell.dice.roll;
		}
		else if(json.data["Higher Spell Slot Dice"]){
			spell.dice.progression = json.data["Higher Spell Slot Dice"]+json.data["Higher Spell Slot Die"]
		}
		else if(json.data["Higher Level Healing"]){
			spell.dice.progression = json.data["Higher Level Healing"];
		}

		//secondary
		if(json.data["Secondary Damage"]){
			spell.dice.secondary = {
				roll: json.data["Secondary Damage"],
				type: json.data["Secondary Damage Type"]
			};
		}
		if(json.data["Secondary Higher Spell Slot Dice"]){
			spell.dice.secondary.progression = json.data["Higher Spell Slot Dice"]
				+ json.data["Higher Spell Slot Die"]
		}

		//store the spell
		this.data[spell.name] = spell;

		//all done
		if(this.loading.length == 0){
			//this.validate();
			this.callback(this.data);
		}
	}


}


module.exports.spells = function(outputPath, ignoreIn, callback){
	require("jsdom/lib/old-api").env("", function(err, window) {
		if (err) throw err;
		$ = require("jquery")(window);

		var importer =  new Importer("Spells","https://roll20.net/compendium/dnd5e/Rules:Spells%20by%20Name", function(fulldata){
			writeFile(outputPath+importer.pagename.toLowerCase()+"_full.json", JSON.stringify({spells: fulldata }));
			console.log("Done importing Spells");
			//writeFile(outputPath+importer.pagename.toLowerCase()+"_full.json", JSON.stringify(this.validate()));
			//writeFile(outputPath+importer.pagename.toLowerCase()+".json", JSON.stringify(this.cleanData()));

			callback({spells: fulldata});
		});

		return importer.run();
		
	});
};

module.exports.monsters = function(outputPath, ignoreIn, callback){
	require("jsdom/lib/old-api").env("", function(err, window) {
		if (err) throw err;
		$ = require("jquery")(window);

		var importer =  new Importer("Monsters","https://roll20.net/compendium/dnd5e/Monsters%20by%20Name", function(fulldata){
			writeFile(outputPath+importer.pagename.toLowerCase()+"_full.json", JSON.stringify({monsters: fulldata }));
			console.log("Done importing Monsters");

			callback({monsters: fulldata});
		});

		return importer.run();
		
	});
};

module.exports.items = function(outputPath, ignoreIn, callback){
	require("jsdom/lib/old-api").env("", function(err, window) {
		if (err) throw err;
		$ = require("jquery")(window);

		var importer =  new Importer("Items","https://roll20.net/compendium/dnd5e/Items", function(fulldata){
			writeFile(outputPath+importer.pagename.toLowerCase()+"_full.json", JSON.stringify({items: fulldata }));
			console.log("Done importing Items");
			callback({items: fulldata});
		});

		return importer.run();
		
	});
};

function writeFile(path, contents) {
  mkdirp(getDirName(path), function (err) {
    if (err) throw err;

    fs.writeFile(path, contents);
  });
}





//------------------------------------------------------------------------------

var characters = {};
var items = {};
var spells = {};
var monsters = {};
var extraMonsterData = {};
var environments = {};
var languages = {};

var localServer = "http://localhost:8080";

/*
Free monsters!
Aarakocra, Allosaurus, Ankylosaurus, Banshee, Barlgura, Bullywug, Crawling Claw, Cyclops, Dao, Drow Mage, Fire Snake, Flameskull, Galeb Duhr, Gnoll Pack Lord, Grell, Half-Ogre, Helmed Horror, Hobgoblin Captain, Hook Horror, Jackalwere, Kenku, Kuo-toa, Kuo-toa Archpriest, Kuo-toa Whip, Lizard King/Queen, Lizardfolk Shaman, Mezzoloth, Mud Mephit, Nothic, Nycaloth, Orc Eye of Gruumsh, Orog, Peryton, Piercer, Pteranodon, Revenant, Shadow Demon, Smoke Mephit, Spectator, Troglodyte, Twig Blight, Umber Hulk, Water Weird, Winged Kobold, Yeti, Yuan-ti Malison, Yuan-ti Pureblood, */
var freeSources = ["Basic Rules","HotDQ supplement","Princes of the Apocalypse Online Supplement"];
var coreSources = ["Monster Manual", "Player's Handbook", "Volo's Guide to Monsters",]; //
var useSources = freeSources;

//TO parse
//https://roll20.net/compendium/dnd5e/Pantheons.json 
//https://roll20.net/compendium/dnd5e/Poisons.json
//https://roll20.net/compendium/dnd5e/Tools
//https://roll20.net/compendium/dnd5e/Mounts%20and%20Vehicles

function loadExisting(){
	$.getJSON("srd-items.json", function(data) {
		items = data;
	});
	$.getJSON("srd-characters.json", function(data) {
		characters = data;
	});
	$.getJSON("srd-monsters.json", function(data) {
		monsters = data.monsters;
		environments = data.environments;
		languages = data.languages;
	});
	$.getJSON("srd-spells.json", function(data) {
		spells = data;
	});
	$.getJSON("monsters.min.json", function(data) {
		extraMonsterData = data;
	});
}


function loadItems() {
	items = loadListing(items,"Items","https://roll20.net/compendium/dnd5e/Items [data-pageid] li")
}
function loadMonsters(){
	monsters = loadListing(monsters,"Monsters","https://roll20.net/compendium/dnd5e/Monsters%20by%20Name [data-pageid] li");
}
function loadSpells(){
	spells = loadListing(spells,"Spells","https://roll20.net/compendium/dnd5e/Rules:Spells%20by%20Name [data-pageid] ul");
}
function loadCharacters(){
	characters.races = loadListing(characters.races,"Races","https://roll20.net/compendium/dnd5e/Races%20by%20Name [data-pageid] li");
	characters.classes = loadListing(characters.classes,"Classes","https://roll20.net/compendium/dnd5e/Classes%20by%20Name [data-pageid] li");

	if(!characters.backgrounds) characters.backgrounds = {};
	var url = "https://roll20.net/compendium/dnd5e/Backgrounds:Acolyte";

	name = url.replace("https://roll20.net/compendium/dnd5e/Backgrounds:","");

	if(!characters.backgrounds[name]){
		loading.push(name);
		updateStatus();

		$.ajax(url+".json").done(function(data) {
			loading.splice(loading.indexOf(data.name),1);
			updateStatus();

			characters.backgrounds[data.name] = data;
		});
	}
}

function getMonsterEnvironment(name){
	var environs;
	var id = "mm."+name.toLowerCase().replace(/\s/g,"-").replace(/[\(\)']+/g,"");
	if(id=="mm.succubus-incubus") id = "mm.succubusincubus"
	if(!extraMonsterData[id]){
		//console.warn("can't find monster "+name);
		return;
	}
	if(!extraMonsterData[id].environment.length)
		return;
	if(monsters[name].environment)
		environs = monsters[name].environment;
	else
		environs = monsters[name].environment = extraMonsterData[id].environment;
	environs = environs.split(", ");

	environs.forEach(function(biome){
		if(!environments[biome])
			environments[biome] = [];
		if(!environments[biome].includes(name))
			environments[biome].push(name);
	});
}
function setMonsterLanugages(langs){
	if(!langs) return;
	var languages = [];

	langs = langs.split(/(?:And)|,/g);
	langs.forEach(function(lang){
		lang = lang.replace("Understands ","");
		lang = lang.replace("And ","");

		if(lang.startsWith("Common"))
			lang = "Common";
		if(lang.includes(" Plus")){
			lang = lang.substring(0, lang.indexOf("Plus")).trim();
		}
		if(lang.includes(" But")){
			lang = lang.substring(0, lang.indexOf("But")).trim();
		}
		if(!lang.trim().length) return;

		if(lang.includes("Telepathy"))
			return;
		if(lang.startsWith("Any ") || lang.startsWith("All ") || lang.startsWith("One ") || lang.startsWith("The Languages ")  || lang.startsWith("the languages ") || lang.includes("Any Language"))
			return;
		
		lang = lang.trim();
		if(lang.length) languages.push(lang);
	});

	return languages;
}
function getExtraMonsters(){
	var monster, log = "";
	for(var id in extraMonsterData){
		monster = extraMonsterData[id];

		if(monster.unique == "unique")
			continue;


		var useme = false;
		for(var i = 0, source; source = useSources[i]; i++){
			if(monster.sources.includes(source)){
				useme = true;
				break;
			}
		}
		if(!useme) continue;

		if(monsters[monster.name]) continue;

		if(monster.name.includes(" (in lair)")){
			var ogmonster = extraMonsterData[id.replace("-in-lair","")];
			if(monster.cr != ogmonster.cr)
				ogmonster.laircr = monster.cr;
			continue;
		}

		monsters[monster.name] = {
			"AC": monster.ac,
			"HP":monster.hp,
			"DEX": getDex(monster.init),
			"Challenge Rating": monster.cr,
			"Size": monster.size.capitalize(),
			"Type": monster.type.capitalize(),
			"Alignment": monster.alignment.capitalize(),
			environment: monster.environment,
			init:monster.init,
			sources: monster.sources
		};

		monster.environment.split(", ").forEach(function(biome){
			if(!environments[biome])
				environments[biome] = [];
			environments[biome].push(monster.name);
		});

		console.log("Added "+monster.name+":  "+JSON.stringify(monsters[monster.name]));
	}
}
function getInitiative(dex){
	if(dex >= 30) return 10;
	if(dex >= 28) return 9;
	if(dex >= 26) return 8;
	if(dex >= 24) return 7;
	if(dex >= 22) return 9;
	if(dex >= 20) return 5;
	if(dex >= 18) return 4;
	if(dex >= 16) return 3;
	if(dex >= 14) return 2;
	if(dex >= 12) return 1;
	if(dex >= 10) return 0;
	if(dex >= 8) return -1;
	if(dex >= 6) return -2;
	if(dex >= 4) return -3;
	if(dex >= 2) return -4;
	return -5;
}
function getDex(init){
	if(init >= 10) return 30;
	if(init == 9) return 28;
	if(init == 8) return 26;
	if(init == 7) return 24;
	if(init == 6) return 22;
	if(init == 5) return 20;
	if(init == 4) return 18;
	if(init == 3) return 16;
	if(init == 2) return 14;
	if(init == 1) return 12;
	if(init == 0) return 10;
	if(init == -1) return 8;
	if(init == -2) return 6;
	if(init == -3) return 4;
	if(init == -4) return 2;
	return -5;
}
function dataCleanup(){
	// Monster sections: Traits,Actions,Legendary Actions,Reactions
	var monster, section, html, $html, sections = {};

	for(var name in monsters){
		

	}
	if(Object.keys(sections).length){
		console.log("Monsters that were cleaned have the following sections: "+Object.keys(sections).join());
	}
	

	var spell;
	for(var name in spells){
		spell = spells[name];
		delete spell["Source"];
		if(typeof spell.htmlcontent == "undefined")
			continue;
		console.log(">> "+name.toUpperCase());
		var html = spell.htmlcontent.replace(/\r?\n|\r/g,"");
		spell.data.description = html;

		delete spell.data["Source"];
		spells[name] = spell.data;
	}

	var benefits = [];

	var item, properties = {};
	for(var name in items){
		item = items[name];

		if(typeof item.htmlcontent == "undefined")
			continue;
		console.log(">> "+name.toUpperCase());

		var html = item.htmlcontent.replace(/\r?\n|\r/g,"");

		if(html.endsWith("<br><br>")){
			html = html.substring(0, html.length-8);
		}
		if(html.includes("<br>")){
			html = html.replace(/<br><br>/g,"<br>").replace(/<br>/g,"<p>");
		}
		if(html.includes("<li>")){
			html = html.replace(/:/g," -").replace(/<li>/g," ").replace(/<\/li>/g,"").replace(/<ul>/g,"").replace(/<\/ul>/g,"");
		}
		html = html.replace(/<\/p>/g,"");

		var parts = html.split("<p>");
		var label = null;
		var unusedLabel = false;

		for(var i = 0; i < parts.length; i++){
			var part = parts[i];

			if(part.toLowerCase() == "requires attunement"){
				item.data.attuned = true;
				continue;
			}
			if(part.startsWith("Ammunition")){
				item.data.isAmmunition = true;
				continue;
			}
			if(part.startsWith("If you use a weapon that has the ammunition property")){
				item.data.isAmmunition = true;
				continue;
			}
			if(part.toLowerCase().includes("requires attunement")){
				part = part.replace(/\(requires attunement\)/ig, "");
				item.data.attuned = true;
			}
			if(part.startsWith("</")){
				part = part.substring(part.indexOf(">")+1);
			}
			if(part.startsWith("<p>") && part.match("<p>").length == 1){
				part = part.replace("<p>","");
			}
			if(part.startsWith("<strong>")){
				if(!part.includes("</strong>")){
					part = part+"</strong>";
				}
				var re = /<strong>(.*)<\/strong>/;

				if(unusedLabel){ //append to previous
					throw "didn't find use for label "+label;
				}

				label = part.match(re)[1];
				part = part.replace("<strong>"+label+"</strong>","");
				if(label.endsWith(".")){
					label = label.substring(0,label.length-1);
				}
				if(part.startsWith(".")){
					part = part.substring(1);
				}
				if(part.includes(":")){
					part = label.trim() + part;
				}else{
					part = label.trim()+": "+part;
				}
				label = null;
			}
			if(part.includes("</strong>.") && !part.includes("<strong>")){
				part = part.replace("</strong>.",": ");
			}
			if(part.startsWith("<table>")){
				var $table = $(part);
				var data = [];
				var names = []

				if(!unusedLabel){
					label = $table.find("td")[0].textContent;
				}
				console.log("\t"+label);

				names = $table.find("tr").first().children().map(function(){
						 return $.trim($(this).text());
					}).get();
				
				$table.find("tr").each(function(){
					var row = {};
					$(this).children().each(function(index){
						row[names[index]] = $.trim($(this).text());
					});	
					data.push(row);
					console.log("\t\t"+JSON.stringify(row).substring(0,175));
				});

				if(label){
					if(!properties[label]) 
						properties[label] = 0;
					properties[label]++
					if(!item.data.detail) 
						item.data.detail = {};
					if(item.data.detail[label]){
						throw "there is already a thing here";
					}
					item.data.detail[label] = data;
					unusedLabel = false;
					label = null;
					continue;
				}
				throw "Unrecognized format";
			}
			if(part.charAt(0) == "<" && !part.startsWith("<em>")){
				throw "Unrecognized format";
			}
			if(!part.length){
				continue;
			}
			if(!item.data.attuned && part.toLowerCase().includes("attunement")){
				throw "unexpected attunement";
			}
			if(part.includes(" with the following statistics:")){
				part = part.replace(" with the following statistics:","");
			}
			if(part.startsWith("To be used as a vehicle, the apparatus requires one pilot")){
				label = null;
			}

			var labelEnd = part.indexOf(":");
			if(part.includes("•")) 
				labelEnd = -1;

			if(labelEnd != 1 && part.includes(".") &&  part.indexOf(".") < part.indexOf(":")){
				//only use the last sentence as a label
				var sentences = part.split(". ");

				var lastSentence = sentences.pop().trim();
				labelEnd = lastSentence.indexOf(":")

				if(labelEnd != -1){ //push previous sentences to description
					if(unusedLabel){
						throw "this is complicated";
					}
					var tempPart = sentences.join(". ");
					if(!item.data.description){
						item.data.description = [];
					}
					item.data.description.push(tempPart);
					console.log("\t"+tempPart.substring(0,175));

					part = lastSentence; //use last sentence
				}
			}
			
			if(labelEnd != -1){
				if(unusedLabel){ //append to previous
					label+= " - "+part.substring(0,labelEnd);
				}
				else{
					label = part.substring(0,labelEnd);
				}

				part = part.substring(labelEnd+1).trim();
				if(!label.length){
					throw "label has no length";
				}

				if(label.includes("wear") && (label.includes("ou gain the following benefits") || label.includes("ou gain these benefits"))){
					label = "Benefits while worn";
				}

				if(!part.length){ ///TODO: split on "."
					unusedLabel = true;
					continue;
				}
				
				if(label.startsWith("While")){
					part = label+": "+part;
					label = null;
				}else{
					console.log("\t"+label);
				
					if(!properties[label]) 
						properties[label] = 0;
					properties[label]++
					if(!item.data.detail) 
						item.data.detail = {};
					item.data.detail[label] = [];
				}
			}

			part = part.replace("•","").trim();

			if(label){

				label = label.trim();
				if(unusedLabel){
					console.log("\t"+label);
					if(label.includes("benefits") || label.includes("While")){
						benefits.push(label);
					}
					else{
						if(!properties[label]) 
							properties[label] = 0;
						properties[label]++
					}

					if(!item.data.detail) 
						item.data.detail = {};
					item.data.detail[label] = [];
				}
				
				item.data.detail[label].push(part);
				console.log("\t\t"+part.substring(0,175));
				unusedLabel = false;
				continue;
			}
			if(!item.data.description){
				item.data.description = [];
			}
			item.data.description.push(part);
			console.log("\t"+part.substring(0,175));
		}
		if(unusedLabel){
			throw "never found use for label "+label;
		}
		delete item.data["Source"];
		items[name] = item.data;
	}
	if(Object.keys(properties).length){
		console.log("Items that were cleaned had the following properties: ");
		Object.keys(properties).forEach(function(txt, index){
			console.log(properties[txt]+": "+txt)
		});
	}
	if(benefits.length){
		console.log("------------ BENEFITS: ");
		benefits.forEach(function(txt, index){console.log(txt)});
	}
	
	insertCosts();
	getExtraMonsters();

	// items em - description
	//  br>propertyname: 
	// ends in <br><br>
	// contains attunement
	console.log("done");
}
function insertCosts(){
	var weaponData = $("#weapons-raw").html().split("\n");
	for(var i = 0, line; line = weaponData[i]; i++){
		var name, cost;
		var j = 0;
		line = line.split(/[\t\s]+/);
		if(line.length == 1){
			continue;
		}

		name = line[j++];
		if(name.includes(",")){
			name = line[j++].capitalize()+" "+name.substring(0,name.length-1);
		}
		else if(isNaN(line[j])){
			name+= " "+line[j++].capitalize();
		}
		cost = line[j++]+" "+line[j++];

		if(!items[name]){
			console.log(name+" "+cost+"\t\t\t"+line.join("|"));
			throw "Can't find weapon "+name;
		}

		items[name].cost = cost;
	}
	extractTable($("#gear-raw").html().split("\n"));
	extractTable($("#armor-raw").html().split("\n"));
}
function extractTable(data){
	for(var i = 0, line; line = data[i]; i++){
		var name, cost = "";
		var j = 0;
		line = line.replace("’","'").split(/[\t\s]+/);
		if(line.length < 4 || data[i] == "Arcane	focus" || data[i] == "Druidic	focus"){
			continue;
		}
		name = line[0];

		var isCost = false;
		for(j = 1; j < line.length; j++){
			if(line[j] == "gp" || line[j] == "sp" || line[j] == "cp"){
				cost+= " "+line[j];
				break;
			}
			else if(isCost || !isNaN(line[j]) || line[j].includes("(") || line[j].includes(")")){
				isCost = true;
				if(line[j].includes(")"))
					cost+=line[j]+" ";
				else
					cost+=line[j];
			}
			else if(name.includes(",")){
				name = name.split(" ");
				var lastname = name.pop();
				name = name.join(" ");
				if(name.length)
					name = name+" "+line[j]+" "+lastname.toLowerCase();
				else
					name = line[j].capitalize()+" "+lastname.toLowerCase();
			}
			else if(isNaN(line[j])){
				if(items[name+" "+line[j]] || line[j] == "and" || line[j] =="of")
					name+= " "+line[j];
				else
					name+= " "+line[j].capitalize();
			}
		}
		name = name.trim().replace(",","").replace("Two-person tent","Tent");
		if(name.includes(" Or "))
			name = name.substring(0, name.indexOf(" Or "));

		if(!items[name]){	
			throw "Can't find item '"+name+"'";
		}
		if(items[name].cost || items[name]["Cost"]){
			continue;
		}
		
		console.log(name+" "+cost+"\t\t\t"+line.join("|"));
		items[name].cost = cost;
	}
}
function updateStatus(){
	if(loading.length)
		$("#status").html("Getting data for: "+loading.join());
	else
		$("#status").html("Done getting data.");
}

function getjson(obj,filename) {
	var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj));
	var dlAnchorElem = document.getElementById('downloadAnchorElem');
	dlAnchorElem.setAttribute("href", dataStr);
	dlAnchorElem.setAttribute("download", filename+".json");
	dlAnchorElem.click();
}
String.prototype.capitalize = function() {
	var arr = this.split(" ");
	arr.forEach(function(str,index){
		arr[index] = str.charAt(0).toUpperCase() + str.slice(1)
	})
	return arr.join(" ");
	
}

