var connect = require('connect')
  , _ = require('underscore')
  , Q = require('q')
  , url = require('url')
  , request = require('./request')
  , utils = connect.utils;

exports = module.exports = NeoRequest;

function NeoRequest(neo4j_url, app, requestInfo) {
	this.batchRequests = [];
	this.neo4j_url = neo4j_url;
	this.app = app;
	this.requestInfo = requestInfo;
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
	var $this = this;

	if(!keyvalue || !indexName) return Q.fcall(function() { return {}; });
	var entity = this.app.getEntity(indexName);
	return request.get(this.neo4j_url + '/db/data/index/node/' + indexName + '/' + entity.key + '/' + keyvalue).then(function(r) {
		if(!r || !r.body || !r.body[0] || !r.body[0].data) return Q.fcall(function() { return r });
	
		//run "read" access rule for applicable entity
		try {
			$this.runRule("read", entity.name, r.body[0].data);
		} catch(err) {
			return Q.fcall(function() { throw err; });
		}
		return Q.fcall(function() { return r; });
	});
}

//update node where key=keyvalue with nodeData
NeoRequest.prototype.updateIndexedNode = function(nodeData, indexName) {
	$this = this;
	var entity = $this.app.getEntity(indexName);
	var keyvalue = $this.getNodeKeyValue(nodeData, indexName);
	
	//run "update" access rule for applicable entity
	try {
		$this.runRule("update", entity.name, nodeData);
	} catch(err) {
		return Q.fcall(function() { throw err; });
	}
	
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
				if(typeof(newNodeData[propName]) == "object" ||
				   typeof(newNodeData[propName]) == "function") {
					delete newNodeData[propName];
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
	var entity = $this.app.getEntity(indexName);
	var nodeUrl = null;
	
	//run "delete" access rule for applicable entity
	try {
		$this.runRule("delete", entity.name, null);
	} catch(err) {
		return Q.fcall(function() { throw err; });
	}
	
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
	var entity = $this.app.getEntity(indexName);
	
	//get the specified key for the new node, if it was provided
	var nodeKeyValue = $this.getNodeKeyValue(nodeData, indexName);
	var entity = _.find(this.app.entities, function(itm) { return itm.indexName == indexName; });
	var self = null;
	var nodeExists = false;
	//if(!nodeKeyValue) return Q.fcall(function() { throw new Error("CREATE " + entity.name + " FAILED: Required key property " + entity.key + " not found. You must include a value for " + entity.key + " as part of your request."); });
	
	//delete any complex properties
	for(var propName in nodeData) {			
		if(typeof(nodeData[propName]) == "object" ||
		   typeof(nodeData[propName]) == "function") {
			delete nodeData[propName];
		}
	}

	//run "create" access rule for applicable entity
	try {
		this.runRule("create", entity.name, nodeData);
	} catch(err) {
		return Q.fcall(function() { throw err; });
	}
	
	//create an index first (e.g. create a 'songs' index for entity 'song')
	return $this.createIndex(indexName).then(function() {
		//if index creation was successful (or index already exists), check if node exists in index			
		return $this.getIndexedNode(nodeKeyValue, indexName).then(function(r) {
			if(r.body && r.body.length > 0) {
				//node already exists, so return error
				//return Q.fcall(function() { throw new Error("CREATE " + entity.name + " FAILED: A " + entity.name + " with key " + entity.key + "=" + nodeKeyValue + " already exists."); });
				
				//node already exists, so update it
				return $this.updateIndexedNode(nodeData, indexName);
				nodeExists = true;

			} else {
				//node doesn't exist, so create it
				return request.post($this.neo4j_url + '/db/data/node', nodeData);
			}
		});
	}).then(function(r) {
		if(!nodeExists && !nodeKeyValue) { //nodeKeyValue was not provided initially. Now that we have the ID of the new node, we will add that as the key.
			self = r.body.self;
			var nodeUrlParts = r.body.self.split('/');
			var newNodeId = nodeUrlParts[nodeUrlParts.length-1].toString();
			nodeKeyValue = newNodeId;
			return request.get(r.body.properties).then(function(resp) {
				var d = resp.body;
				d[entity.key] = newNodeId;
				return request.put(r.body.properties, d);
			}, function(err) {
				return Q.fcall(function() { throw err; });
			});
		} else return Q.fcall(function() { return r; });
	}).then(function(r) {
		if(!nodeExists && r) {
			//node creation was successful, so add it to the indexName index
			//TODO: batch this with node creation request
			return request.post($this.neo4j_url + '/db/data/index/node/' + indexName, {
				"value": nodeKeyValue,
				"uri": (self ? self : r.body.self),
				"key": entity.key
			});
		} else {
			return Q.fcall(function() { return r; });
		}
	});
}

//creates an index in neo4j named indexName, if it doesn't already exist
NeoRequest.prototype.createIndex = function(indexName) {
	var entity = this.app.getEntity(indexName);
	
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

//gets the value of a node's key
NeoRequest.prototype.getNodeKeyValue = function(nodeData, indexName) {
	var entity = this.app.getEntity(indexName);
	
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
	var $this = this;
	var entity = _.find(this.app.entities, function(itm) { return itm.indexName == nodeIndex; });
	var dir1 = ((dir == "in" || dir == "all") ? '<-' : '-');
	var dir2 = ((dir == "out" || dir == "all") ? '->' : '-');
	var query = "START n1 = node:" + entity.indexName + "(" + entity.key + "={keyval}) MATCH n1" + dir1 + "[r:" + relationshipType + "]" + dir2 + "n2 RETURN r,n2";
	if(this.requestInfo.skip) query += " SKIP " + this.requestInfo.skip;
	if(this.requestInfo.limit) query += " LIMIT " + this.requestInfo.limit;
	var params = { "keyval": nodeKeyValue };
	//cypher query to get all related nodes
	return this.executeCypherQuery(query, params).then(function(r) {
		var nodesWithRelData = [];
		if(r && r.body && r.body.data) {
			//add the relationship properties to the node object
			for(var i in r.body.data) {
				var d = r.body.data[i];
				var rel = d[0].data;
				var node = d[1].data;
				var numRelProps = 0;
				if(rel) {
					for(var j in rel) numRelProps++;
				}
				if(numRelProps > 0) node.relationship = rel;
				nodesWithRelData.push(node);
			}
		}
		
		//run 'read' rules for each related node
		var nodesWithoutErrors = [];
		for(var i in nodesWithRelData) {
			try {
				$this.runRule("read", entity.name, nodesWithRelData[i]);
				nodesWithoutErrors.push(nodesWithRelData[i]);
			} catch(err) {
				//if a rule throws an error, ignore the error.  The node will not be included in the get.			
			}
		}
		
		return Q.fcall(function() { return nodesWithoutErrors });
	});
}

//gets relationships of type relationshipType for a given node
NeoRequest.prototype.getRelationships = function(nodeKeyValue, nodeIndex, relationshipType, dir) {
	var entity = _.find(this.app.entities, function(itm) { return itm.indexName == nodeIndex; });
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
	
	var endEntity = $this.app.getEntity(endNodeIndex);
	var startEntity = $this.app.getEntity(startNodeIndex);
	var conn = $this.app.getConnection(relationshipName, (to ? startEntity.name : endEntity.name), (to ? endEntity.name : startEntity.name));
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
	var endNodeKey = null;
	
	var startNodeData = null;
	
	return $this.getIndexedNode(startNodeKey, startNodeIndex).then(function(r) { //check if the start node exists
		startNodeUrl = (r.body && r.body.length > 0 ? r.body[0].self : null);
		if(!startNodeUrl) { //start doesn't exist, so throw an error
			return Q.fcall(function() { throw new Error("CREATE CONNECTION " + relDefString + " FAILED: " + startEntity.name + " with key " + startEntity.key + "=" + startNodeKey + " does not exist.") });
		} else { //start node exists, so keep going		
			startNodeData = r.body[0].data;
			return $this.getIndexedNode(keyval, endNodeIndex);
		}
	}).then(function(r) { 
		if(r && r.body && r.body.length > 0) { //end node exists, so keep going
			var ret = r;
			if(r.body[0]) ret.body = r.body[0];
			return ret;
		} else { //end node doesn't exist, so create it
			return $this.createIndexedNode(endNodeData, endNodeIndex);
		}		
	}).when(function(r) {
		endNodeUrl = (r.body ? r.body.self : null);		
		endNodeData = (r.body ? r.body.data : null);
		endNodeKey = endNodeData[endEntity.key];
		//check if relationship already exists
		if(endNodeUrl) {
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
				
			//run "create" access rules that apply to this relationship
			var targetEndpoint = (to ? conn.outboundPath : conn.inboundPath);
			try {
				if(to) $this.runRule("create", targetEndpoint, startNodeData, endNodeData, relPostObj.data);
				else $this.runRule("create", targetEndpoint, endNodeData, startNodeData, relPostObj.data);
			} catch(err) {
				return Q.fcall(function() { throw err; });
			}
			
			return request.post(relStartNode + '/relationships', relPostObj);
		} else {
			//if relationship already exists
			if(relData && existingRel.properties) { //if relationship properties were included in the request		
				
				//run "update" access rules that apply to this relationship
				var targetEndpoint = (to ? conn.outboundPath : conn.inboundPath);
				try {
					if(to) $this.runRule("update", targetEndpoint, startNodeData, endNodeData, relData);
					else $this.runRule("update", targetEndpoint, endNodeData, startNodeData, relData);
				} catch(err) {
					return Q.fcall(function() { throw err; });
				}
			
				//update the relationship properties	
				return request.put(existingRel.properties, relData);
			} else { //no relationship properties were provided, so throw an error
				return Q.fcall(function() { throw new Error("UPDATE CONNECTION " + relDefString + " FAILED: No relationship properties were provided as part of the request") });
			}
		}
	}).then(function(r) {
		return Q.fcall( function() { return endNodeKey; } );
	});
}

NeoRequest.prototype.runRule = function(operation, path, startNodeData, endNodeData, relationshipData) {
	var rules = _.filter(this.app.accessRules, function(itm) {
		return itm.operation == operation && itm.path == path;
	});
	for(var i in rules) {
		var rule = rules[i];
		rule.func(this.requestInfo, startNodeData, endNodeData, relationshipData);
	}
}
