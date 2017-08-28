#!/usr/bin/env node

let ioList = require('./io-list.json');
let converters = require('./import/_converters.js');
let fs = require('fs');

/* TODO: combine all sources together, create compiled files, individual class files, etc. */
var countSources = 0;
var numFinished = 0;
var allData = {}

function doImport(){
	for(var i = 2; i < process.argv.length; i++){
		console.log(""+(i-1)+") running "+process.argv[i]+" conversion");
		var ioarr  = ioList[process.argv[i]];
		for(var j = 0, io; j < ioarr.length; j++){
			countSources++;
			io = ioarr[j];
			console.log("\t"+(j+1)+". converting "+io.in+" into "+io.out+" using "+io.convert);
			converters[io.convert](io.out, io.in, compileData);
		}
	}
}


/**
 * Compiles data from all sources and when they are all complete, writes json files.
 */
function compileData(data){
	numFinished++;

	//append to allData
	Object.assign(allData,data);
	data = allData;

	if(countSources == numFinished){

		var things = {
			"monster":{},
			"item":{}
		};

		var types = [];
		for(var name in data.monsters){
			var monster = data.monsters[name];
			var type = monster.data.Type.toLowerCase();
			if(!types.includes(type)) types.push(type);

			var obj = {
				isa: type
			}
			if(monster.languages && monster.languages.length){
				obj.languages = monster.languages;
			}

			things[name.toLowerCase()] = obj;
		}
		types.forEach((type) => {
			things[type] = {
				isa: "monster"
			}
		});

		var types = [];
		for(var name in data.items){
			var item = data.items[name];
			var type = item.data["Item Type"].toLowerCase();
			if(item.data["Damage Type"])
				type = item.data["Damage Type"].toLowerCase()+" weapon";
			if(!types.includes(type)) types.push(type);
			
			var obj = {
				isa: type
			}
			things[name.toLowerCase()] = obj;
		}
		types.forEach((type) => {
			things[type] = {
				isa: "item"
			}
		});

		var obj = {
			"name": "nested-dnd-data",
			"version": "0.0.1",
			"description": "5.0 SRD retrieved from roll20.net",
			"author": "Cattegy",
			"dependencies": [],
			"defaultSeed": "monster",
			"things": things
		}

		fs.writeFile("./data/packs/nested-dnd-data.json", JSON.stringify(obj));
	}
}


doImport();