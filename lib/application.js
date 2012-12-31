var express = require('express')
  , connect = require('connect')
  , _ = require('underscore')
  , Q = require('q')
  , url = require('url')
  , utils = connect.utils
  , NeoRequest = require('./neorequest');

var app = exports = module.exports = {};
__app = null;

app.init = function(options){
	__app = this;
	this.nodeTypes = options.nodeTypes;
	this.relationshipTypes = options.relationshipTypes;
	this.neorequest = null;
    this.configureService();
};

app.configureService = function() {
	//for each nodeType in initialized options
	for(var i in this.nodeTypes) {
		var nt = this.nodeTypes[i];
		
		//pluralize indexName based on the nodeType name, if an indexName is not provided
		var indexName = (nt.indexName || nt.name + "s");
		this.nodeTypes[i].indexName = indexName;
		
		//create routes for...
		//CREATE node
		this.post('/' + indexName, nodeCreateHandler);	
		
		//GET node
		this.get('/' + indexName + '/:keyvalue', nodeGetHandler);		
		
		//UPDATE node
		this.put('/' + indexName + '/:keyvalue', nodePutHandler);
		
		//DELETE node
		this.delete('/' + indexName + '/:keyvalue', nodeDeleteHandler);
	}
	
	__app.neorequest = new NeoRequest(__app.neo4j_url, this.nodeTypes);
}

//Handler for node GET
//handles all GET requests for a node with a specific keyvalue (e.g. GET requests to '/songs/123' to find song where key=123
function nodeGetHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	__app.neorequest.getIndexedNode(req.params.keyvalue, indexName).then(function(s) {
		//respond with node data
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		res.send(nodeData);
	}, function(err) {
		//respond with error
		res.send(errorResp(err));
	});
}

//Handler for node UPDATE
//handles all PUT requests for a node with a specific keyvalue (e.g. PUT requests to '/songs/123' to update song where key=123
function nodePutHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	
	//update the requested node
	__app.neorequest.updateIndexedNode(req.params.keyvalue, req.body, indexName).then(function(s) {
		//respond with successful response
		res.send(true);
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
}

//Handler for node DELETE
//handles all DELETE requests for a node with a specific keyvalue (e.g. DELETE requests to '/songs/123' to delete song where key=123
function nodeDeleteHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	
	//delete the requested node
	__app.neorequest.deleteIndexedNode(req.params.keyvalue, indexName).then(function(s) {
		//respond with successful response
		res.send(true);
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
}

//Handler for node CREATE
//handles all POST requests to a nodeType's endpoint (e.g. POST requests to '/songs' for creation of a nodeType 'song')
function nodeCreateHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	
	//create a new node and add it to the index with indexName
	__app.neorequest.createIndexedNode(req.body, indexName).then(function(s) {
		//respond with successful response, containing a service url for accessing the new node
		var host = req.protocol + '://' + req.headers.host;
		res.send({ 
			"url": host + '/' + indexName + '/' + __app.neorequest.getNodeKeyValue(req.body, indexName)
		});
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
	
}

//gets the indexName from a URL
function getIndexNameFromUrl(urlString) {
	var splitUrlPath = url.parse(urlString).pathname.split('/');
	for(var i in splitUrlPath) {
		if(splitUrlPath[i] && splitUrlPath[i] != "") return splitUrlPath[i];
	}
	return null;
}

//Error Response Object
function errorResp(errMsg) {
	return { "error" : errMsg.toString() };
}

