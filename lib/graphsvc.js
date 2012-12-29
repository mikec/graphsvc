var express = require('express')
  , connect = require('connect')
  , proto = require('./application')
  , utils = connect.utils;

exports = module.exports = createApplication;

/*__app = null;
__neo4j_url = null;
__options = null;*/

function createApplication(neo4j_url, options) {
	var app = express();
	utils.merge(app, proto);
	app.neo4j_url = neo4j_url;
	app.use(express.bodyParser());
	app.init(options);
	return app;

	/*__app = express();
	__app.use(express.bodyParser());
	__neo4j_url = neo4j_url;
	__options = options;
	configureService(options);	
	return __app;*/
}