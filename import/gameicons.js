let fs = require('fs');



module.exports = function(outputPath, inputPath, callback){
	var pack = {
		name: "game-icons",
		version: "1.0.0",
		description: "Game Icons",
		author: "http://game-icons-font.net",
		dependencies: [],
		tables: {}
	};

	function done(){
		if(Object.keys(pack.tables).length == inputPath.length){
				fs.writeFile(outputPath+"game-icons.json",JSON.stringify(pack));
			}
	}


	fs.readFile(inputPath[0], 'utf8', (err, data) => {
		if (err) throw err;

		data = data.substr(data.indexOf(".gi-brutal-helm")-1);
		var iconNames = [];

		var myRe = (/}\.gi-(.*?):/g);

		while ((myArray = myRe.exec(data)) !== null) {
			iconNames.push(myArray[1]);
		}

		pack.tables["GAME ICONS"] = iconNames;

		done();
	});

	fs.readFile(inputPath[1], 'utf8', (err, data) => {
		if (err) throw err;

		var iconNames = [];

		var myRe = (/prefix}-(.*?):before/g);

		while ((myArray = myRe.exec(data)) !== null) {
			iconNames.push(myArray[1]);
		}

		pack.tables["FONTAWESOME ICONS"] = iconNames;

		done();
	});
}