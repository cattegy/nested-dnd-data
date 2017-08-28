let fs = require('fs')
	, http = require('http')
	, vm = require('vm')
	, concat = require('concat-stream');


module.exports = function(outputPath, input){
	require("jsdom/lib/old-api").env("", function(err, window) {
		http.get({
		    host: "orteil.dashnet.org", 
		    port: 80, 
		    path: '/nestedscript.js'
		  }, 
		  function(res) {
		    res.setEncoding('utf8');
		    res.pipe(
		    	concat({ encoding: 'string' }, 
		    		function(remoteSrc) {
		    			remoteSrc = remoteSrc.split('new Thing("later",["sorry"],"will do later");')[0];
				    	vm.runInThisContext(remoteSrc, 'remote_modules/nestedscript.js');

				    	//Things is an array and it shouldn't be
				    	var _things = { 42: Things[42] }
				    	Object.keys(Things).map(function(key){
				    		var thing = Things[key]

				    		delete thing.name;
				    		if(thing.namegen === key)
				    			delete thing.namegen;

				    		if(Object.keys(thing).length === 1 && thing.contains !== undefined)
				    			thing = thing.contains;

				    		_things[key] = thing;
				    	});

				    	var pack = {
				    		name: "orteil-nested",
				    		version: "1.0.0",
				    		description: "Nested by Orteil",
				    		author: "Orteil",
				    		dependencies: [],
				    		defaultSeed: "universe",
				    		things: _things
				    	}

				    	fs.writeFile(outputPath+'nested-orteil.json',JSON.stringify(pack));
		    	})

		    );
		});

/*remoteSrc.split("And now, the fun begins!");
				    	console.log(remoteSrc[1]);
				    	/*vm.runInThisContext(remoteSrc[1], 'remote_modules/nestedscript.js');
				    	console.log(JSON.stringify(Things));
				    	*/
	});
}