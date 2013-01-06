var express = require('express')
  , connect = require('connect')
  , utils = connect.utils
  , proto = require('./application')
  , r = require('./request')
  , neorequest = require('./neorequest');

exports = module.exports = createApplication;

function createApplication(neo4j_url, options) {
	var app = express();
	utils.merge(app, proto);
	app.neo4j_url = neo4j_url;
	app.use(express.bodyParser());
	app.init(options);
	app.Request = r;
	app.NeoRequest = neorequest;
	return app;
}