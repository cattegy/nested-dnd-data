let fs = require('fs'),
	PDFParser = require("pdf2json");

module.exports = function(outputPath, file){
	var pdfParser = new PDFParser(this,1);
	var baseFile = file.split("/");
	baseFile = baseFile[baseFile.length-1].split(".")[0];

	pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
	pdfParser.on("pdfParser_dataReady", pdfData => {
		fs.writeFile(outputPath+baseFile+'.txt', pdfParser.getRawTextContent());
	});
	pdfParser.loadPDF(file);
}