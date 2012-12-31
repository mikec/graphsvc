var connect = require('connect')
  , _ = require('underscore')
  , Q = require('q')
  , url = require('url')
  , request = require('./request')
  , utils = connect.utils;

exports = module.exports = NeoRequest;

function NeoRequest(neo4j_url, nodeTypes) {
	this.batchRequests = [];
	this.neo4j_url = neo4j_url;
	this.nodeTypes = nodeTypes;
}

NeoRequest.prototype.addBatchRequest = function(method, url, data) {
	var nextId = this.batchRequests.length;
	var reqData = {
		"method": method,
		"to": url,
		"id": nextId
	}
	if(data) reqData.body = data;
	this.batchRequests.push(reqData);
}

NeoRequest.prototype.executeBatchRequests = function(url) {
	return request.post(url, this.batchRequests);
}

//get node where key=keyvalue from index of indexName
NeoRequest.prototype.getIndexedNode = function(keyvalue, indexName) {
	var nodeType = this.getNodeType(indexName);
	return request.get(this.neo4j_url + '/db/data/index/node/' + indexName + '/' + nodeType.key + '/' + keyvalue);
}

//update node where key=keyvalue with nodeData
NeoRequest.prototype.updateIndexedNode = function(keyvalue, nodeData, indexName) {
	$this = this;
	var nodeType = $this.getNodeType(indexName);
	return $this.getIndexedNode(keyvalue, indexName).then(function(s) {
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
			
			//find all null properties in newNodeData
			var funcs = [];
			var propUpdateReq = new NeoRequest();
			for(var propName in newNodeData) {
				if(newNodeData[propName] == null) {
					var f = request.del;
					f.url = nodeUrl + '/properties/' + propName;
					funcs.push(f); //add delete func to array - each delete will be executed in sequence
					delete newNodeData[propName]; //delete the null property
				}
			}

			//execute the property delete requests in sequence, then execute the put request
			var result = Q.resolve();
			funcs.forEach(function (f) {
				result = result.then(function() {
					return f(f.url);
				});
			});
			return result.then(function() {
				return request.put(nodeUrl + '/properties', newNodeData);
			});
		
		} else {
			//node doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("PUT " + nodeType.name + " FAILED: " + nodeType.name + " with key " + nodeType.key + "=" + keyvalue + " does not exist.") });
		}
	});
}

//delete node from indexName where key=keyvalue
NeoRequest.prototype.deleteIndexedNode = function(keyvalue, indexName) {
	$this = this;
	var nodeType = $this.getNodeType(indexName);
	return $this.getIndexedNode(keyvalue, indexName).then(function(s) {
		var nodeUrl = (s.body && s.body.length > 0 ? s.body[0].self : null);
		if(nodeUrl) {
			//TODO: delete relationships first, otherwise this delete will fail
			return request.del(nodeUrl);
		} else {
			//node doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("DELETE " + nodeType.name + " FAILED: " + nodeType.name + " with key " + nodeType.key + "=" + keyvalue + " does not exist.") });
		}
	});
}

//creates a node with properties in nodeData
NeoRequest.prototype.createIndexedNode = function(nodeData, indexName) {
	var $this = this;

	//get the nodeType definition for the specified index
	var nodeType = $this.getNodeType(indexName);
	
	//make sure that the nodeData that was posted specifies a key for the new node
	var nodeKeyValue = $this.getNodeKeyValue(nodeData, indexName);
	if(!nodeKeyValue) return Q.fcall(function() { throw new Error("CREATE " + nodeType.name + " FAILED: Required key property " + nodeType.key + " not found. You must include a value for " + nodeType.key + " as part of your request."); });
	
	//create an index first (e.g. create a 'songs' index for nodeType 'song')
	return $this.createIndex(indexName).then(function() {
		//if index creation was successful (or index already exists), check if node exists in index			
		return $this.getIndexedNode(nodeKeyValue, indexName).then(function(r) {
			if(r.body && r.body.length > 0) {
				//node already exists, so return error
				return Q.fcall(function() { throw new Error("CREATE " + nodeType.name + " FAILED: A " + nodeType.name + " with key " + nodeType.key + "=" + nodeKeyValue + " already exists."); });
			} else {
				//node doesn't exist, so create it
				return request.post($this.neo4j_url + '/db/data/node', nodeData);
			}
		});
	}).then(function(s) {
		//node creation was successful, so add it to the indexName index
		//TODO: batch this with node creation request
		return request.post($this.neo4j_url + '/db/data/index/node/' + indexName, {
			"value": nodeKeyValue,
			"uri": s.body.self,
			"key": nodeType.key
		});
	});
}

//creates an index in neo4j named indexName, if it doesn't already exist
NeoRequest.prototype.createIndex = function(indexName) {
	var nodeType = this.getNodeType(indexName);
	
	//TODO: check database for existing index first
	if(!nodeType.indexCreated) {
		var configData = {"name" : indexName,"config" : {"type" : "fulltext","provider" : "lucene"}};
		return request.post(this.neo4j_url + '/db/data/index/node', configData).then(function(s) {
			nodeType.indexCreated = true;
			return s;
		});
	} else {
		return Q.fcall(function() { return true; });
	}
}

//get nodeType from indexName
NeoRequest.prototype.getNodeType = function(indexName) { return _.find(this.nodeTypes, function(itm) { return itm.indexName == indexName; }); }

//gets the value of a node's key
NeoRequest.prototype.getNodeKeyValue = function(nodeData, indexName) {
	var nodeType = _.find(this.nodeTypes, function(itm) { return itm.indexName == indexName; });
	
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
