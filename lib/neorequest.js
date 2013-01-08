var connect = require('connect')
  , _ = require('underscore')
  , Q = require('q')
  , url = require('url')
  , request = require('./request')
  , utils = connect.utils;

exports = module.exports = NeoRequest;

function NeoRequest(neo4j_url) {
	this.batchRequests = [];
	this.neo4j_url = neo4j_url;
	this.entities = [];
	this.connections = [];
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

NeoRequest.prototype.executeBatchRequests = function() {
	var $this = this;
	if($this.batchRequests.length > 0) {
		return request.post($this.neo4j_url + '/db/data/batch', $this.batchRequests).then(function(r) {
			$this.clearBatchRequests();
			return Q.fcall(function() { return r; }); 
		});
	} else {
		return Q.fcall(function() { throw new Error("No batch requests to execute"); }); 
	}
}

NeoRequest.prototype.clearBatchRequests = function() {
	this.batchRequests = [];
}

NeoRequest.prototype.executeCypherQuery = function(query, params) {
	return request.post(
		this.neo4j_url + '/db/data/cypher',
		{
			"query": query,
			"params": params
		}
	);
}

//get node where key=keyvalue from index of indexName
NeoRequest.prototype.getIndexedNode = function(keyvalue, indexName) {
	var entity = this.getEntity(indexName);
	return request.get(this.neo4j_url + '/db/data/index/node/' + indexName + '/' + entity.key + '/' + keyvalue);
}

//update node where key=keyvalue with nodeData
NeoRequest.prototype.updateIndexedNode = function(nodeData, indexName) {
	$this = this;
	var entity = $this.getEntity(indexName);
	var keyvalue = $this.getNodeKeyValue(nodeData, indexName);
	
	return $this.getIndexedNode(keyvalue, indexName).then(function(s) {
		var nodeUrl = (s.body && s.body.length > 0 ? s.body[0].self : null);
		if(nodeUrl) {
			//node exists, so get it's data
			var existingNodeData = s.body[0].data;
			//merge the existing node data with the new node data
			var newNodeData = utils.merge(existingNodeData, nodeData);
			//don't allow the node's key property to be modified - always set it to the existing key
			if(existingNodeData[entity.key]) {
				newNodeData[entity.key] = existingNodeData[entity.key];
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
			}).then(function() {
				return request.get(nodeUrl);
			});
		
		} else {
			//node doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("UPDATE " + entity.name + " FAILED: " + entity.name + " with key " + entity.key + "=" + keyvalue + " does not exist.") });
		}
	});
}

//delete node from indexName where key=keyvalue
NeoRequest.prototype.deleteIndexedNode = function(keyvalue, indexName) {
	$this = this;
	var entity = $this.getEntity(indexName);
	var nodeUrl = null;
	return $this.getIndexedNode(keyvalue, indexName).then(function(s) {
		nodeUrl = (s.body && s.body.length > 0 ? s.body[0].self : null);
		if(nodeUrl) {
			//get all relationships for deletion
			return request.get(nodeUrl + '/relationships/all');
		} else {
			//node doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("DELETE " + entity.name + " FAILED: " + entity.name + " with key " + entity.key + "=" + keyvalue + " does not exist.") });
		}
	}).then(function(r) {
		//execute delete requests for each relationship
		$this.clearBatchRequests();
		for(var i in r.body) {
			$this.addBatchRequest("DELETE", r.body[i].self);
		}
		if($this.batchRequests.length > 0) return $this.executeBatchRequests();
		else return Q.fcall(function() { return true; });		
	}).then(function(r) {
		//delete the orphaned node
		return request.del(nodeUrl);
	});
}

//creates a node with properties in nodeData
NeoRequest.prototype.createIndexedNode = function(nodeData, indexName) {
	var $this = this;

	//get the entity definition for the specified index
	var entity = $this.getEntity(indexName);
	
	//make sure that the nodeData that was posted specifies a key for the new node
	var nodeKeyValue = $this.getNodeKeyValue(nodeData, indexName);
	if(!nodeKeyValue) return Q.fcall(function() { throw new Error("CREATE " + entity.name + " FAILED: Required key property " + entity.key + " not found. You must include a value for " + entity.key + " as part of your request."); });
	
	//create an index first (e.g. create a 'songs' index for entity 'song')
	return $this.createIndex(indexName).then(function() {
		//if index creation was successful (or index already exists), check if node exists in index			
		return $this.getIndexedNode(nodeKeyValue, indexName).then(function(r) {
			if(r.body && r.body.length > 0) {
				//node already exists, so return error
				return Q.fcall(function() { throw new Error("CREATE " + entity.name + " FAILED: A " + entity.name + " with key " + entity.key + "=" + nodeKeyValue + " already exists."); });
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
			"key": entity.key
		});
	});
}

//creates an index in neo4j named indexName, if it doesn't already exist
NeoRequest.prototype.createIndex = function(indexName) {
	var entity = this.getEntity(indexName);
	
	//TODO: check database for existing index first
	if(!entity.indexCreated) {
		var configData = {"name" : indexName,"config" : {"type" : "fulltext","provider" : "lucene"}};
		return request.post(this.neo4j_url + '/db/data/index/node', configData).then(function(s) {
			entity.indexCreated = true;
			return s;
		});
	} else {
		return Q.fcall(function() { return true; });
	}
}

//get entity from indexName
NeoRequest.prototype.getEntity = function(indexName) { return _.find(this.entities, function(itm) { return itm.indexName == indexName; }); }

//gets the value of a node's key
NeoRequest.prototype.getNodeKeyValue = function(nodeData, indexName) {
	var entity = _.find(this.entities, function(itm) { return itm.indexName == indexName; });
	
	//make sure that the nodeData that was posted specifies a key for the new node
	var nodeKeyValue = null;
	for(var prop in nodeData) {
		if(prop == entity.key) {
			nodeKeyValue = nodeData[prop];
			break;
		}
	}
	return nodeKeyValue;
}

NeoRequest.prototype.getRelatedNodes = function(nodeKeyValue, nodeIndex, relationshipType, dir) {
	var entity = _.find(this.entities, function(itm) { return itm.indexName == nodeIndex; });
	var dir1 = ((dir == "in" || dir == "all") ? '<-' : '-');
	var dir2 = ((dir == "out" || dir == "all") ? '->' : '-');
	var query = "START n1 = node:" + entity.indexName + "(" + entity.key + "={keyval}) MATCH n1" + dir1 + "[r:" + relationshipType + "]" + dir2 + "n2 RETURN r,n2";
	var params = { "keyval": nodeKeyValue };
	return this.executeCypherQuery(query, params);
}

//gets relationships of type relationshipType for a given node
NeoRequest.prototype.getRelationships = function(nodeKeyValue, nodeIndex, relationshipType, dir) {
	var entity = _.find(this.entities, function(itm) { return itm.indexName == nodeIndex; });
	var nodeUrl = null;
	
	return this.getIndexedNode(nodeKeyValue, nodeIndex).then(function(r) {
		nodeUrl = (r.body && r.body.length > 0 ? r.body[0].self : null);
		if(nodeUrl) {
			return Q.fcall(function() { return true; });
		} else {
			return Q.fcall(function() { throw new Error("GET " + relationshipType + " CONNECTION FAILED: " + entity.name + " with key " + entity.key + "=" + nodeKeyValue + " does not exist.") });
		}
	}).then(function(r) {
		return request.get(nodeUrl + '/relationships/' + dir + '/' + relationshipType);
	});
}

//deletes an existing relationship
NeoRequest.prototype.deleteRelationship = function(startNodeIndex, startNodeKeyProperty, startNodeKeyValue, endNodeIndex, endNodeKeyProperty, endNodeKeyValue, relationshipName) {
	var relDefString = "'" + startNodeIndex + "/" + startNodeKeyValue + "' " + relationshipName + " '" + endNodeIndex + "/" + endNodeKeyValue + "'";

	return this.executeCypherQuery(
		"START n1 = node:" + startNodeIndex + "(" + startNodeKeyProperty + "={keyvalue1}), " +
		"      n2 = node:" + endNodeIndex + "(" + endNodeKeyProperty + "={keyvalue2}) MATCH n1<-[r:" + relationshipName + "]->n2 RETURN r",
		{ "keyvalue1": startNodeKeyValue, "keyvalue2": endNodeKeyValue }
	).then(function(r) {
		var rel;
		if(r && r.body && r.body.data && r.body.data[0] && r.body.data[0][0] && r.body.data[0][0].self) {
			rel = r.body.data[0][0].self;
		}
		if(!rel) return Q.fcall(function() { throw new Error("DELETE CONNECTION FAILED: " + relDefString + " does not exist.") });
		return request.del(rel);
	});
}

//creates a new relationship
NeoRequest.prototype.createRelationship = function(startNodeIndex, startNodeKey, endNodeIndex, endNodeData, relationshipName, dir) {
	var $this = this;
	
	var to = (dir == "out" || dir == "all");
	
	var endEntity = $this.getEntity(endNodeIndex);
	var startEntity = $this.getEntity(startNodeIndex);
	var keyval = endNodeData[endEntity.key];
	var relDefString = "'" + startNodeIndex + "/" + startNodeKey + "' " + relationshipName + " '" + endNodeIndex + "/" + keyval + "'";
	
	//if node has relationship data, move it out of the nodeData object
	var relData = null;
	if(endNodeData.relationship) {
		relData = endNodeData.relationship;
		delete endNodeData.relationship;
	}

	var startNodeUrl = null;
	var endNodeUrl = null;
	
	return $this.getIndexedNode(startNodeKey, startNodeIndex).then(function(r) { //check if the start node exists
		startNodeUrl = (r.body && r.body.length > 0 ? r.body[0].self : null);
		if(!startNodeUrl) { //start doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("CREATE CONNECTION " + relDefString + " FAILED: " + startEntity.name + " with key " + startEntity.key + "=" + startNodeKey + " does not exist.") });
		} else { //start node exists, so check if end node exists
			return $this.getIndexedNode(keyval, endNodeIndex);
		}
	}).then(function(r) { 
		if(r && r.body && r.body.length > 0) { //end node exists, so keep going
			var ret = r;
			if(r.body[0]) ret.body = r.body[0];
			return ret;
		} else { //end node doesn't exist
			return $this.createIndexedNode(endNodeData, endNodeIndex);
		}
	}).when(function(r) {
		endNodeUrl = (r.body ? r.body.self : null);		
		//check if relationship already exists
		if(endNodeUrl) {
			//return $this.getRelationships((to ? startNodeKey : keyval), (to ? startNodeIndex : endNodeIndex), relationshipName, dir);
			return $this.getRelationships(startNodeKey, startNodeIndex, relationshipName, dir);
		} else {
			return Q.fcall(function() { throw new Error("CREATE CONNECTION " + relDefString + " FAILED: Unable to create " + endEntity.name + " with " + endEntity.key + "=" + keyval) });
		}
	}).then(function(r) {		
		var relStartNode = (to ? startNodeUrl : endNodeUrl);
		var relEndNode = (to ? endNodeUrl : startNodeUrl);
		var existingRel = _.find(r.body, function(itm) {
			return (itm.start == relStartNode && itm.end == relEndNode);
		});
		if(!existingRel) {
			//if relationship doesn't exist, create it
			var relPostObj = {
				"to": relEndNode,
				"type": relationshipName
			};
			if(relData) relPostObj.data = relData;
			return request.post(relStartNode + '/relationships', relPostObj);
		} else {
			//if relationship already exists
			if(relData && existingRel.properties) { //if relationship properties were included in the request, update the relationship properties
				return request.put(existingRel.properties, relData);
			} else { //no relationship properties were provided, so throw an error
				return Q.fcall(function() { throw new Error("UPDATE CONNECTION " + relDefString + " FAILED: No relationship properties were provided as part of the request") });
			}
		}
	});
}
