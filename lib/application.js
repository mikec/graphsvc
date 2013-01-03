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
	this.entities = [];
	this.connections = [];
	this.neorequest = new NeoRequest(this.neo4j_url);
};

app.entity = function(path) {
	var entity = getEntityFromPath(path);
	
	//check if entity has already been added
	var existingEntity = _.find(this.entities, function(itm) { return itm.name == entity.name });
	if(existingEntity) throw new Error("Entity '" + entity.name + "' has already been added!");
	
	this.entities.push(entity);
	this.neorequest.entities = this.entities;
	
	//create routes for...
	//CREATE node
	this.post('/' + entity.indexName, nodeCreateHandler);	
	
	//GET node
	this.get('/' + entity.indexName + '/:keyvalue', nodeGetHandler);		
	
	//UPDATE node
	this.put('/' + entity.indexName + '/:keyvalue', nodeUpdateHandler);
	
	//DELETE node
	this.delete('/' + entity.indexName + '/:keyvalue', nodeDeleteHandler);
	
	return this.entities;	
}

app.connection = function(relationshipName, startPath, endPath) {
	var startConn = parsePath(startPath);
	var endConn = parsePath(endPath);
	var startEntity = _.find(this.entities, function(itm) { return itm.indexName == startConn.index });
	var endEntity = _.find(this.entities, function(itm) { return itm.indexName == endConn.index });
	
	if(!startEntity) throw new Error("Entity for '" + startConn.index + "' does not exist");
	if(!endEntity) throw new Error("Entity for '" + endConn.index + "' does not exist");
	
	//TODO: check if connection exists, throw an error if it does
	var connection = {"relationshipName": relationshipName, "start": startConn, "end": endConn};
	this.connections.push(connection);
	this.connections.entities = this.connections;
	
	//routes for start entity
	this.post('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipCreateHandler);
	this.get('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipGetHandler);
	this.put('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipUpdateHandler);
	this.delete('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipDeleteHandler);
	
	//routes for end entity
	this.post('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipCreateHandler);
	this.get('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipGetHandler);
	this.put('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipUpdateHandler);
	this.delete('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipDeleteHandler);
	
	return this.connections;
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
function nodeUpdateHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	var entity = _.find(__app.entities, function(itm) { return itm.indexName == indexName; }); 
	req.body[entity.key] = (parseInt(req.params.keyvalue) > 0 ? parseInt(req.params.keyvalue) : req.params.keyvalue); //convert to int if the key is a valid int
	
	//update the requested node
	__app.neorequest.updateIndexedNode(req.body, indexName).then(function(s) {
		//respond with successful response
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		res.send(nodeData);
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

//Handler for relationship GET
function relationshipGetHandler(req, res) {
	var pathObj = parsePath(req.url);
	var conn = _.find(__app.connections, function(itm) {
		return (
			(itm.start.index == pathObj.index && itm.start.connection == pathObj.connection) ||
			(itm.end.index == pathObj.index && itm.end.connection == pathObj.connection)
		);
	});
	var nodeToRelationshipMap = {};
	var nodes = {};
	var to = (conn.start.index == pathObj.index);
	
	//get all relationships
	__app.neorequest.getRelationships(pathObj.key, pathObj.index, conn.relationshipName, to).then(function(r) {
		//get data for each node, and each set of relationship properties
		__app.neorequest.clearBatchRequests();
		for(var i in r.body) {
			var nodeUrl = (to ? r.body[i].end : r.body[i].start);
			nodeToRelationshipMap[nodeUrl] = r.body[i].properties;
			nodes[nodeUrl] = true;
			__app.neorequest.addBatchRequest("GET", nodeUrl);
			__app.neorequest.addBatchRequest("GET", r.body[i].properties);
		}
		return __app.neorequest.executeBatchRequests();
	}).then(function(r) {
		var nodesToReturn = [];
		for(var i in r.body) {
			var obj = r.body[i];
			if(nodes[obj.from]) {
				var d = obj.body.data;
				if(nodeToRelationshipMap[obj.from]) {
					for(var j in r.body) {
						if(r.body[j].from == nodeToRelationshipMap[obj.from] && r.body[j].body) {
							d.relationship = r.body[j].body;
						}
					}
				}
				nodesToReturn.push(d);
			}
		}
		res.send(nodesToReturn);
	}, function(err) {
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship UPDATE
function relationshipUpdateHandler(req, res) {

}

//Handler for relationship DELETE
function relationshipDeleteHandler(req, res) {

}

//Handler for relationship CREATE
//handles all POST requests to a connection endpoint (e.g. POST requests to '/bands/101/members')
function relationshipCreateHandler(req, res) {
	var pathObj = parsePath(req.url);
	var conn = _.find(__app.connections, function(itm) {
		return (
			(itm.start.index == pathObj.index && itm.start.connection == pathObj.connection) ||
			(itm.end.index == pathObj.index && itm.end.connection == pathObj.connection)
		);
	});
	var to = (conn.start.index == pathObj.index);
	var endNode = (to ? conn.end : conn.start);
	__app.neorequest.createRelationship(pathObj.index, pathObj.key, endNode.index, req.body, conn.relationshipName, to).then(function(r) {
		res.send(true);
	}, function(err) {
		res.send(errorResp(err));
	}).done();
}


//gets an entity object from the user defined path string, and entity name if provided
function getEntityFromPath(path, entityName) {
	var entity = { "name":null, "indexName":null, "key":null };
	if(!path) return entity;
	pathObj = parsePath(path);
	entity.indexName = pathObj.index;
	entity.name = (entityName ? entityName : singularize(pathObj.index));
	entity.key = pathObj.key;
	return entity;
}

//parses a path into it's three parts (index/:key/connection)
//TODO: check format somewhere and throw an error if it doesn't match...
function parsePath(path) {
	pathRet = {"index":null, "key":null, "connection":null};
	//trim leading slash
	if(path.substr(0,1) == '/') path = path.substr(1, path.length - 1);
	parts = path.split('/');
	pathRet.index = parts[0];
	pathRet.key = parts[1];
	pathRet.connection = (parts[2] || null);
	return pathRet;
}

//gets the indexName from a URL
function getIndexNameFromUrl(urlString) {
	var splitUrlPath = url.parse(urlString).pathname.split('/');
	for(var i in splitUrlPath) {
		if(splitUrlPath[i] && splitUrlPath[i] != "") return splitUrlPath[i];
	}
	return null;
}

function singularize(str) {
	var lastChar = str.substr(str.length-1,1);
	return (lastChar == 's' ? str.substr(0, str.length-1) : str);
}

//Error Response Object
function errorResp(errMsg) {
	return { "error" : errMsg.toString() };
}

