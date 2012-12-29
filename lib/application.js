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
    this.configureService();
};

app.configureService = function() {
	//for each nodeType in initialized options
	for(var i in this.nodeTypes) {
		var nt = this.nodeTypes[i];
		
		//pluralize indexName based on the nodeType name, if an indexName is not provided
		var indexName = (nt.indexName || nt.name + "s");
		this.nodeTypes[i].indexName = indexName;
		
		//create routes for
		//CREATE
		this.post('/' + indexName, nodeCreateHandler);
		
		//GET
		this.get('/' + indexName + '/:keyvalue', nodeGetHandler);
		
		//UPDATE
		this.put('/' + indexName + '/:keyvalue', nodePutHandler);
		
		//DELETE
	}
}

//Handler for node GET
//handles all GET requests for a node with a specific keyvalue (e.g. GET requests to '/songs/123' to find song where key=123
function nodeGetHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	getIndexedNode(req.params.keyvalue, indexName).then(function(s) {
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
	updateIndexedNode(req.params.keyvalue, req.body, indexName).then(function(s) {
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
	createIndexedNode(req.body, indexName).then(function(s) {
		//respond with successful response, containing a service url for accessing the new node
		var host = req.protocol + '://' + req.headers.host;
		res.send({ 
			"url": host + '/' + indexName + '/' + getNodeKeyValue(req.body, indexName)
		});
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
	
}

//get node where key=keyvalue from index of indexName
function getIndexedNode(keyvalue, indexName) {
	var nodeType = getNodeType(indexName);
	return NeoRequest.get(__app.neo4j_url + '/db/data/index/node/' + indexName + '/' + nodeType.key + '/' + keyvalue);
}

//update node where key=keyvalue with nodeData
function updateIndexedNode(keyvalue, nodeData, indexName) {
	var nodeType = getNodeType(indexName);
	return getIndexedNode(keyvalue, indexName).then(function(s) {
		var nodeUrl = (s.body && s.body.length > 0 ? s.body[0].self : null);
		if(nodeUrl) {
			//node exists, so get it's data
			var existingNodeData = s.body[0].data;
			//merge the existing node data with the new node data
			var newNodeData = utils.merge(existingNodeData, nodeData);
			//don't allow the node's key property to be modified - always set it to the existing key
			if(existingNodeData[nodeType.key]) {
				newNodeData[nodeType.key] = existingNodeData[nodeType.key];
			}
			
			//TODO: unbatch these - if any of them 404's then neo4j will rollback the whole batch .. we don't want that
			//create batch request to delete properties that are set to null
			var propUpdateReq = new NeoRequest();
			for(var propName in newNodeData) {
				if(newNodeData[propName] == null) {
					propUpdateReq.addBatchRequest("delete", nodeUrl + '/properties/' + propName, null);
					delete newNodeData[propName];
				}
			}
			//add put for new data to batch request
			propUpdateReq.addBatchRequest("put", nodeUrl + '/properties', newNodeData);
			//execute requests to delete any null properties and update node
			return propUpdateReq.executeBatchRequests(__app.neo4j_url + '/db/data/batch');
			
		} else {
			//node doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("PUT " + nodeType.name + " FAILED: " + nodeType.name + " with key " + nodeType.key + "=" + req.params.keyvalue + " does not exist.") });
		}
	});
}

//creates a node with properties in nodeData
function createIndexedNode(nodeData, indexName) {
	//get the nodeType definition for the specified index
	var nodeType = getNodeType(indexName);
	
	//make sure that the nodeData that was posted specifies a key for the new node
	var nodeKeyValue = getNodeKeyValue(nodeData, indexName);
	if(!nodeKeyValue) return Q.fcall(function() { throw new Error("CREATE " + nodeType.name + " FAILED: Required key property " + nodeType.key + " not found. You must include a value for " + nodeType.key + " as part of your request."); });
	
	//create an index first (e.g. create a 'songs' index for nodeType 'song')
	return createIndex(indexName, __app).then(function() {
		//if index creation was successful (or index already exists), check if node exists in index			
		return getIndexedNode(nodeKeyValue, indexName).then(function(r) {
			if(r.body && r.body.length > 0) {
				//node already exists, so return error
				return Q.fcall(function() { throw new Error("CREATE " + nodeType.name + " FAILED: A " + nodeType.name + " with key " + nodeType.key + "=" + nodeKeyValue + " already exists."); });
			} else {
				//node doesn't exist, so create it
				return NeoRequest.post(__app.neo4j_url + '/db/data/node', nodeData);
			}
		});
	}).then(function(s) {
		//node creation was successful, so add it to the indexName index
		//TODO: batch this with node creation request
		return NeoRequest.post(__app.neo4j_url + '/db/data/index/node/' + indexName, {
			"value": nodeKeyValue,
			"uri": s.body.self,
			"key": nodeType.key
		});
	});
}

//creates an index in neo4j named indexName, if it doesn't already exist
function createIndex(indexName) {
	var nodeType = getNodeType(indexName);
	
	//TODO: check database for existing index first
	if(!nodeType.indexCreated) {
		var configData = {"name" : indexName,"config" : {"type" : "fulltext","provider" : "lucene"}};
		return NeoRequest.post(__app.neo4j_url + '/db/data/index/node', configData).then(function(s) {
			nodeType.indexCreated = true;
			return s;
		});
	} else {
		return Q.fcall(function() { return true; });
	}
}

//get nodeType from indexName
function getNodeType(indexName) { return _.find(__app.nodeTypes, function(itm) { return itm.indexName == indexName; }); }

//gets the indexName from a URL
function getIndexNameFromUrl(urlString) {
	var splitUrlPath = url.parse(urlString).pathname.split('/');
	for(var i in splitUrlPath) {
		if(splitUrlPath[i] && splitUrlPath[i] != "") return splitUrlPath[i];
	}
	return null;
}

//gets the value of a node's key
function getNodeKeyValue(nodeData, indexName) {
	var nodeType = _.find(__app.nodeTypes, function(itm) { return itm.indexName == indexName; });
	
	//make sure that the nodeData that was posted specifies a key for the new node
	var nodeKeyValue = null;
	for(var prop in nodeData) {
		if(prop == nodeType.key) {
			nodeKeyValue = nodeData[prop];
			break;
		}
	}
	return nodeKeyValue;
}

//Error Response Object
function errorResp(errMsg) {
	return { "error" : errMsg.toString() };
}

