var express = require('express')
  , connect = require('connect')
  , proto = require('./application')
  , utils = connect.utils;

exports = module.exports = createApplication;

function createApplication(neo4j_url, options) {
	var app = express();
	utils.merge(app, proto);
	app.neo4j_url = neo4j_url;
	app.use(express.bodyParser());
	app.init(options);
	return app;
}