let roll20srd = require('./roll20srd.js');

module.exports= {
	"pdf2text": require('./pdf2text.js'),
	"srd-spells": roll20srd.spells,
	"srd-monsters": roll20srd.monsters,
	"srd-items": roll20srd.items,
	"nested": require('./nested2json.js'),
	"gameicons": require('./gameicons.js')
}