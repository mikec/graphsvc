var express = require('express')
  , connect = require('connect')
  , utils = connect.utils
  , request = require('./request')
  , _ = require('underscore')
  , Q = require('q')
  , url = require('url')
  , utils = connect.utils;

exports = module.exports = createApplication;

function createApplication(neo4j_url) {
	var app = express();
	var graphSvc = new GraphSvc(neo4j_url);
	utils.merge(app, graphSvc);
	app.use(express.bodyParser());
	app.Request = request;
	return app;
}

function GraphSvc(neo4j_url) {
	__app = this;

	this.neo4j_url = neo4j_url;
	this.defaultSkip = 0;
	this.defaultLimit = 1000;

	this.entities = [];
	this.connections = [];
	this.customProperties = [];
	this.customEndpoints = [];
	this.accessRules = [];
	this.afterProcessingFns = [];
	this.beforeProcessingFns = [];
	this.q = Q;
}

GraphSvc.prototype.endpoint = function(arg1, arg2, arg3) {
	if(typeof(arg2) == 'function' || typeof(arg3) == 'function') {
		if(arg1.indexOf('.') > 0) {
			this.addCustomProperty(arg1, arg2, arg3);
		} else {
			this.addCustomEndpoint(arg1, arg2);
		}
	} else if(arg1.indexOf('.') > 0) this.addConnection(arg1, arg2, arg3);
	else this.addEntity(arg1, arg2);
	return this;
}

GraphSvc.prototype.addEntity = function(entityName, options) {

	//config info
	this.get('/config', function(req, res) {
		res.send({
			entities: __app.entities,
			connections: __app.connections,
			customProperties: __app.customProperties,
			customEndpoints: __app.customEndpoints
		});
	});

	var entity = {};
	entity.name = entityName;
	entity.indexName = (options && options.collectionName ? options.collectionName : entityName + 's');
	entity.key = (options && options.key ? options.key : 'id');
	
	//check if entity has already been added
	var existingEntity = _.find(this.entities, function(itm) { return itm.name == entity.name });
	if(existingEntity) throw new Error("Entity '" + entity.name + "' has already been added!");
	
	this.entities.push(entity);
	
	//create routes for...
	//CREATE node
	this.post('/' + entity.indexName, nodeCreateHandler);
	this.post('/' + entity.indexName + '/:keyvalue', nodeCreateHandler);
	
	//GET node
	this.get('/' + entity.indexName + '/:keyvalue', nodeGetHandler);		
	
	//UPDATE node
	this.put('/' + entity.indexName + '/:keyvalue', nodeUpdateHandler);
	
	//DELETE node
	this.delete('/' + entity.indexName + '/:keyvalue', nodeDeleteHandler);
	
	return this;	
}

GraphSvc.prototype.addConnection = function(a, b, c) {
	var endpoint1, endpoint2, connectionName;
	endpoint1 = a;
	if(!c) {
		endpoint2 = a;
		connectionName = b;
	} else {
		endpoint2 = b;
		connectionName = c;
	}
	var endpoint1Parts = endpoint1.split('.');
	var endpoint2Parts = endpoint2.split('.');
	var startEntName = endpoint1Parts[0];
	var endEntName = endpoint2Parts[0];
	
	var startEntity = _.find(this.entities, function(itm) { return itm.name == startEntName });
	var endEntity = _.find(this.entities, function(itm) { return itm.name == endEntName });
	
	var startConn = {
		"index": startEntity.indexName,
		"key": startEntity.key,
		"connection" : endpoint1Parts[1],
		"entity": startEntity
	}; var endConn = {
		"index": endEntity.indexName,
		"key": endEntity.key,
		"connection" : endpoint2Parts[1],
		"entity": endEntity
	};
	
	if(!startEntity) throw new Error("Entity for '" + startConn.index + "' does not exist");
	if(!endEntity) throw new Error("Entity for '" + endConn.index + "' does not exist");
	
	//TODO: check if connection exists, throw an error if it does
	var connection = {
		"relationshipName": connectionName, 
		"outboundPath": startEntity.name + "." + startConn.connection,
		"inboundPath": endEntity.name + "." + endConn.connection,
		"start": startConn, 
		"end": endConn
	};
	this.connections.push(connection);
	//this.connections.entities = this.connections;
	
	//routes for start entity
	this.post('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipCreateHandler);
	this.get('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipGetHandler);
	this.delete('/' + startConn.index + '/:keyvalue/' + startConn.connection + '/:connectionkeyvalue', relationshipDeleteHandler);
	
	//routes for end entity
	this.post('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipCreateHandler);
	this.get('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipGetHandler);
	this.delete('/' + endConn.index + '/:keyvalue/' + endConn.connection + '/:connectionkeyvalue', relationshipDeleteHandler);

	return this;
}

GraphSvc.prototype.getConnections = function(indexName) {
	if(!indexName) {
		return this.connections;
	} else {
		var conns = _.filter(this.connections, function(itm) {
			return (itm.start.index == indexName) || (itm.end.index == indexName);
		});
		//get an array of connections for this node
		var connections = [];
		for(var i in conns) {
			var c = conns[i];
			var connObj = {
				"urlName": (c.start.index == indexName ? c.start.connection : c.end.connection),
				"relationshipName": c.relationshipName
			}
			var dir = (c.start.index == indexName ? "out" : "in");
			if(c.start.index == c.end.index) dir = "all";
			connObj.dir = dir;
			connections.push(connObj);
		}
		return connections;
	}
}

GraphSvc.prototype.addCustomProperty = function() {
	var baseEntityName, returnEntityName, propertyName, fn;
	baseEntityName = arguments[0].split('.')[0];
	propertyName = arguments[0].split('.')[1];
	if(typeof(arguments[1]) == 'function') fn = arguments[1];
	else {
		returnEntityName = arguments[1];
		fn = arguments[2];
	}

	var customProp = {
		property: propertyName,
		fn: fn
	};

	customProp.baseEntity = _.find(this.entities, function(itm) { return itm.name == baseEntityName; });
	if(!customProp.baseEntity) throw new Error("Entity for '" + baseEntityName + "' does not exist");

	if(returnEntityName) {
		customProp.returnEntity = _.find(this.entities, function(itm) { return itm.name == returnEntityName; });
		if(!customProp.returnEntity ) throw new Error("Entity for '" + returnEntityName + "' does not exist");
	}

	this.customProperties.push(customProp);

	//routes for custom property
	this.get('/' + customProp.baseEntity.indexName + '/:keyvalue/' + customProp.property, function(req, res) {
		var reqInfo = new RequestInfo(req, res);
		fn(reqInfo).then(function(r) {
			res.send(r);
		}, function(err) {
			res.statusCode = 500;
			res.send(errorResp(err));
		});
	});

}

GraphSvc.prototype.getCustomProperties = function(indexName) {
	if(!indexName) {
		return this.customProperties;
	} else {
		return _.filter(this.customProperties, function(itm) {
			return itm.baseEntity.indexName == indexName;
		});
	}
}

GraphSvc.prototype.addCustomEndpoint = function(endpointName, fn) {

	this.customEndpoints.push(endpointName);

	this.get('/' + endpointName, function(req, res) {
		var reqInfo = new RequestInfo(req, res);
		fn(reqInfo).then(function(r) {
			res.send(r);
		}, function(err) {
			res.statusCode = 500;
			res.send(errorResp(err));
		});
	});
}

GraphSvc.prototype.after = function(operations, path, func) {
	return this.processingFunc(false, operations, path, func);
}

GraphSvc.prototype.before = function(operations, path, func) {
	return this.processingFunc(true, operations, path, func);
}

GraphSvc.prototype.processingFunc = function(before, operations, path, func) {
	var processStore = (before ? this.beforeProcessingFns : this.afterProcessingFns);
	var ops = operations.split(',');
	for(var i in ops) {
		var op = ops[i];
		var fnObj = {
			operation: op,
			path: path,
			func: func
		}
		processStore.push(fnObj);
	}
	return this;
}

GraphSvc.prototype.getEntity = function(indexName) { return _.find(this.entities, function(itm) { return itm.indexName == indexName; }); }
GraphSvc.prototype.getConnection = function(pathOrName, startEntityName, endEntityName) {
	if(pathOrName.indexOf(".") > -1) {
		return _.find(this.connections, function(itm) { return (itm.outboundPath == pathOrName || itm.inboundPath == pathOrName); });
	} else {
		return _.find(this.connections, function(itm) { 
			return (
				itm.relationshipName == pathOrName &&
				itm.start.entity.name == startEntityName &&
				itm.end.entity.name == endEntityName
			); 
		});
	}
}

GraphSvc.prototype.addBatchRequest = function(method, url, data) {
	var nextId = this.batchRequests.length;
	var reqData = {
		"method": method,
		"to": url,
		"id": nextId
	}
	if(data) reqData.body = data;
	this.batchRequests.push(reqData);
}

GraphSvc.prototype.executeBatchRequests = function() {
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

GraphSvc.prototype.clearBatchRequests = function() {
	this.batchRequests = [];
}

GraphSvc.prototype.executeCypherQuery = function(query, params) {
	return request.post(
		this.neo4j_url + '/db/data/cypher',
		{
			"query": query,
			"params": params
		}
	);
}

//get node where key=keyvalue from index of indexName
GraphSvc.prototype.getIndexedNode = function(keyvalue, indexName) {
	var $this = this;

	if(!keyvalue || !indexName) return Q.fcall(function() { return {}; });
	var entity = this.getEntity(indexName);

	//try to create index, in case it doesn't already exist
	return $this.createIndex(indexName).then(function() {
		//get the node
		return request.get($this.neo4j_url + '/db/data/index/node/' + indexName + '/' + entity.key + '/' + keyvalue);
	}).then(function(r) {
		return Q.fcall(function() { return r; });
	});
}

//update node where key=keyvalue with nodeData
GraphSvc.prototype.updateIndexedNode = function(nodeData, indexName) {
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
GraphSvc.prototype.deleteIndexedNode = function(keyvalue, indexName) {
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
GraphSvc.prototype.createIndexedNode = function(nodeData, indexName) {
	var $this = this;
	
	//get the entity definition for the specified index
	var entity = $this.getEntity(indexName);
	
	//get the specified key for the new node, if it was provided
	var nodeKeyValue = $this.getNodeKeyValue(nodeData, indexName);
	var entity = _.find(this.entities, function(itm) { return itm.indexName == indexName; });
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
GraphSvc.prototype.createIndex = function(indexName) {
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

//gets the value of a node's key
GraphSvc.prototype.getNodeKeyValue = function(nodeData, indexName) {
	var entity = this.getEntity(indexName);
	
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

GraphSvc.prototype.getRelatedNodes = function(nodeKeyValue, nodeIndex, relationshipType, dir, skip, limit) {
	var $this = this;
	var entity = _.find(this.entities, function(itm) { return itm.indexName == nodeIndex; });
	var dir1 = ((dir == "in" || dir == "all") ? '<-' : '-');
	var dir2 = ((dir == "out" || dir == "all") ? '->' : '-');
	var query = "START n1 = node:" + entity.indexName + "(" + entity.key + "={keyval}) MATCH n1" + dir1 + "[r:" + relationshipType + "]" + dir2 + "n2 RETURN r,n2";

	query += " SKIP " + (parseInt(skip) >= 0 ? skip : this.defaultSkip);
	query += " LIMIT " + (parseInt(limit) >= 0 ? limit : this.defaultLimit);
	
	var countQuery = "START n1 = node:" + entity.indexName + "(" + entity.key + "={keyval}) MATCH n1" + dir1 + "[r:" + relationshipType + "]" + dir2 + "n2 RETURN count(n2)";
	var params = { "keyval": nodeKeyValue };
	//cypher query to get all related nodes
	var relNodes = {
		count: 0
	};
	return this.executeCypherQuery(countQuery, params).then(function(r) {
		if(r && r.body && r.body.data && r.body.data.length > 0) {
			relNodes.count = parseInt(r.body.data[0]);
		}
		return $this.executeCypherQuery(query, params);
	}).then(function(r) {
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

		relNodes.data = nodesWithRelData;
		
		return Q.fcall(function() { return relNodes; });
	});
}

//gets relationships of type relationshipType for a given node
GraphSvc.prototype.getRelationships = function(nodeKeyValue, nodeIndex, relationshipType, dir) {
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
GraphSvc.prototype.deleteRelationship = function(startNodeIndex, startNodeKeyProperty, startNodeKeyValue, endNodeIndex, endNodeKeyProperty, endNodeKeyValue, relationshipName) {
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
GraphSvc.prototype.createRelationship = function(startNodeIndex, startNodeKey, endNodeIndex, endNodeData, relationshipName, dir) {
	var $this = this;
	
	var to = (dir == "out" || dir == "all");
	
	var endEntity = $this.getEntity(endNodeIndex);
	var startEntity = $this.getEntity(startNodeIndex);
	var conn = $this.getConnection(relationshipName, (to ? startEntity.name : endEntity.name), (to ? endEntity.name : startEntity.name));
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
			return request.post(relStartNode + '/relationships', relPostObj);
		} else {
			//if relationship already exists
			if(relData && existingRel.properties) { //if relationship properties were included in the request				
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

//Handler for node GET
//handles all GET requests for a node with a specific keyvalue (e.g. GET requests to '/songs/123' to find song where key=123
function nodeGetHandler(req, res) {

	var reqInfo = new RequestInfo(req, res);

	RunBeforeProcessing('read', null, reqInfo).then(function() {
		return __app.getIndexedNode(req.params.keyvalue, reqInfo.index);
	}).then(function(s) {
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		
		var host = req.protocol + '://' + req.headers.host;
		
		var getRelatedNodeCallParams = [];
		
		//add connection urls to node data
		//create a list of included connections calls
		var connections = __app.getConnections(reqInfo.index);
		for(var i in connections) {
			//if(!nodeData.connections) nodeData.connections = {};
			var cObj = connections[i];
			
			//add the url of each connection to the nodeData to be sent to the client
			//nodeData[cObj.urlName] = host + '/' + reqInfo.index + '/' + req.params.keyvalue + '/' + cObj.urlName;
			
			if(_.contains(reqInfo.includes, cObj.urlName)) {
				getRelatedNodeCallParams.push(cObj);
			}
		}

		var customProps = __app.getCustomProperties(reqInfo.index);
		for(var i in customProps) {
			var cp = customProps[i];
			cp.isCustomProperty = true;
			if(_.contains(reqInfo.includes, cp.property)) {
				getRelatedNodeCallParams.push(cp);
			}
		}
		
		//if there are any included connections, get their nodes and add them to the nodeData object
		if(getRelatedNodeCallParams.length > 0) {
			var result = Q.resolve();
			getRelatedNodeCallParams.forEach(function (connObj) {
				result = result.then(function() {
					if(connObj.isCustomProperty) {
						return connObj.fn(reqInfo).then(function(data) {
							nodeData[connObj.property] = data;
							return Q.fcall(function() { return nodeData; });
						});
					} else {
						return __app.getRelatedNodes(
									req.params.keyvalue, 
									reqInfo.index, 
									connObj.relationshipName, 
									connObj.dir,
									reqInfo.skip,
									reqInfo.limit
							   ).then(function(relatedNodes) {
							nodeData[connObj.urlName] = new PagedData(relatedNodes.data, relatedNodes.count, reqInfo);
							return Q.fcall(function() { return nodeData; });
						});
					}
				});
			});
			return result;
		} else {
			return Q.fcall(function() { return nodeData; });
		}
		
	}).then(function(r) {
		return RunAfterProcessing('read', r, reqInfo);
	}).then(function(r) {
		res.send(r);
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	});
}

//Handler for node UPDATE
//handles all POST requests for a node with a specific keyvalue (e.g. POST requests to '/songs/123' to update song where key=123
function nodeUpdateHandler(req, res) {
	var reqInfo = new RequestInfo(req, res);

	//convert key to int
	req.body[reqInfo.keyProperty] = (parseInt(req.params.keyvalue) > 0 ? parseInt(req.params.keyvalue) : req.params.keyvalue); 

	//update the requested node
	__app.updateEntity(req.body, reqInfo.index, true, reqInfo).then(function(r) {
		res.send(r);
	}, function(err) {
		//respond with an error
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

GraphSvc.prototype.updateEntity = function(data, indexName, runBefores, runAfters, requestInfo) {	
	var $this = this;
	return (function() {		
		if(runBefores) {
			return RunBeforeProcessing('update', data, requestInfo);
		} else {
			return Q.fcall(function() { return data; });
		}
	})().then(function(r) {
		return $this.updateIndexedNode(r, indexName);
	}).then(function(r) {
		var nodeData = (r.body && r.body[0] && r.body[0].data ? r.body[0].data : {});
		if(runAfters) {
			return RunAfterProcessing('update', nodeData, requestInfo);
		} else {
			return Q.fcall(function() { return data; });
		}
	});
}

//Handler for node DELETE
//handles all DELETE requests for a node with a specific keyvalue (e.g. DELETE requests to '/songs/123' to delete song where key=123
function nodeDeleteHandler(req, res) {
	
	var reqInfo = new RequestInfo(req, res);

	RunBeforeProcessing('delete', null, reqInfo).then(function() {
		return __app.deleteIndexedNode(req.params.keyvalue, reqInfo.index);
	}).then(function(r) {
		return RunAfterProcessing('delete', r, reqInfo);
	}).then(function(r) {
		//respond with successful response
		res.send(true);
	}, function(err) {
		//respond with an error
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for node CREATE
//handles all POST requests to a nodeType's endpoint (e.g. POST requests to '/songs' for creation of a nodeType 'song')
function nodeCreateHandler(req, res) {
	
	var reqInfo = new RequestInfo(req, res);

	if(req.params && req.params.keyvalue) {
		req.body[reqInfo.keyProperty] = req.params.keyvalue;
	}
	
	__app.createEntity(req.body, reqInfo.index, true, true, reqInfo).then(function(r) {
		res.send(r);
	}, function(err) {
		//respond with an error
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

GraphSvc.prototype.createEntity = function(data, indexName, runBefores, runAfters, requestInfo) {
	var $this = this;
	return (function() {		
		if(runBefores) {
			return RunBeforeProcessing('create', data, requestInfo);
		} else {
			return Q.fcall(function() { return data; });
		}
	})().then(function(data) {
		return $this.createIndexedNode(data, indexName).then(function(resp) {
			var keyvalue = $this.getNodeKeyValue(resp.body.data, indexName);
			var d = { 
				"key": keyvalue,
				"data": {}
			};
			for(var p in data) {
				d.data[p] = data[p];
			}
			return (function() {		
				if(runAfters) {
					return RunAfterProcessing('create', d, requestInfo);
				} else {
					return Q.fcall(function() { return d; });
				}
			})();
		});
	});
}

//Handler for relationship GET
function relationshipGetHandler(req, res) {
		
	var reqInfo = new RequestInfo(req, res);
	
	__app.getRelatedNodes(
		req.params.keyvalue, 
		reqInfo.index, 
		reqInfo.connection.relationshipName, 
		reqInfo.connection.direction, 
		reqInfo.skip, 
		reqInfo.limit
	).then(function(r) {		
		res.send(new PagedData(r.data, r.count, reqInfo));
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship DELETE
function relationshipDeleteHandler(req, res) {
	var reqInfo = new RequestInfo(req, res);
	
	__app.deleteRelationship(
		reqInfo.baseEntity.index, 
		reqInfo.baseEntity.keyProperty,
		req.params.keyvalue,
		reqInfo.connectedEntity.index,
		reqInfo.connectedEntity.keyProperty,
		req.params.connectionkeyvalue,
		reqInfo.connection.relationshipName
	).then(function(r) {
		res.send(true);
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship CREATE
//handles all POST requests to a connection endpoint (e.g. POST requests to '/bands/101/members')
function relationshipCreateHandler(req, res) {
		
	var reqInfo = new RequestInfo(req, res);
	
	var endNode = ((reqInfo.connection.direction == "out" || reqInfo.connection.direction == "all") ? reqInfo.connection.end : reqInfo.connection.start);
	__app.createRelationship(
		reqInfo.index, 
		req.params.keyvalue, 
		endNode.index, 
		req.body, 
		reqInfo.connection.relationshipName, 
		reqInfo.connection.direction
	).then(function(r) {
		res.send({
			connectedEntityKey: r,
			connectedEntityUrl: endNode.index + '/' + r
		});
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//gets an entity object from the user defined path string, and entity name if provided
function getEntityFromPath(path, entityName) {
	var entity = { "name":null, "indexName":null, "key":null };
	if(!path) return entity;
	var pathObj = parsePath(path);
	entity.indexName = pathObj.index;
	entity.name = (entityName ? entityName : singularize(pathObj.index));
	entity.key = pathObj.key;
	return entity;
}

//parses a path into it's three parts (index/:key/connection)
//TODO: check format somewhere and throw an error if it doesn't match...
function parsePath(path) {
	var pathRet = {"index":null, "key":null, "connection":null};
	//trim leading slash
	if(path.substr(0,1) == '/') path = path.substr(1, path.length - 1);
	//separate querystring
	var parts = path.split('?');
	
	var segments = parts[0].split('/');
	pathRet.index = segments[0];
	pathRet.key = segments[1];
	pathRet.connection = (segments[2] || null);
	pathRet.connectionKey = (segments[3] || null);
	
	pathRet.query = (parts.length > 1 ? parts[1] : null);
	
	return pathRet;
}

function RequestInfo(req, res) {
	var $this = this;
	
	//parse the request URL
	var pathObj = parsePath(req.url);
	this.index = pathObj.index;
	this.keyValue = pathObj.key;
	this.connection = pathObj.connection;
	this.request = req;
	this.response = res;
	
	this.absoluteUrl = this.request.protocol + '://' + this.request.headers.host + this.request.url;
	
	var ent = _.find(__app.entities, function(itm) {
		return (itm.indexName == $this.index);
	});
	if(ent) {
		this.entityName = ent.name;
		this.keyProperty = ent.key;
		this.baseEntity = new Entity(pathObj.index, ent.key, pathObj.key);
	}
	
	if(pathObj.connection) { // if the request is for a connection
		this.connection = _.find(__app.connections, function(itm) {
			return (
				(itm.start.index == $this.index && itm.start.connection == pathObj.connection) ||
				(itm.end.index == $this.index && itm.end.connection == pathObj.connection)
			);
		});
		if(this.connection) {
			var connectedEntityIndex;
			if(this.connection.start.index == this.connection.end.index) {
				this.connection.direction = "all";
				connectedEntityIndex = this.connection.start.index;
			} else if(this.connection.start.index == this.index) {
				this.connection.direction = "out";
				connectedEntityIndex = this.connection.end.index;
			} else {
				this.connection.direction = "in";
				connectedEntityIndex = this.connection.start.index;
			}
			
			var connEntity = _.find(__app.entities, function(itm) {
				return (itm.indexName == connectedEntityIndex);
			});
			var connectedEntityKeyVal = (req.body && req.body[connEntity.key] ? req.body[connEntity.key] : null);
			if(!connectedEntityKeyVal && pathObj.connectedKey) connectedEntityKeyVal = pathObj.connectedKey;
			
			this.connectedEntity = new Entity(connEntity.indexName, connEntity.key, connectedEntityKeyVal);
		}
	} else { // if the request is for an entity

	} 
	
	//requested connections to include
	this.includes = [];
	if(req.query && req.query.include) this.includes = req.query.include.split(',');
	
	//paging
	if(req.query && req.query.limit) this.limit = parseInt(req.query.limit);
	if(req.query && req.query.skip) this.skip = parseInt(req.query.skip);
	
}

function PagedData(data, count, reqInfo) {
	this.data = data;
	this.count = count;
	if(reqInfo.limit) {
		var url = reqInfo.absoluteUrl.split('?')[0] + '?';
		for(var param in reqInfo.request.query) {
			if(param != 'limit' && param != 'skip') {
				url += param + '=' + reqInfo.request.query[param] + '&';
			}
		}
		var curSkip = reqInfo.skip;
		if(!curSkip) curSkip = 0;
		var nextSkip = (curSkip + reqInfo.limit);
		var prevSkip = (curSkip > 0 ? curSkip - reqInfo.limit : null);
		if(prevSkip < 0) prevSkip = 0;
		var nextPageUrl = url + 'limit=' + reqInfo.limit + '&skip=' + nextSkip;
		var prevPageUrl;
		if(prevSkip || prevSkip == 0) {
			prevPageUrl = url + 'limit=' + reqInfo.limit + (prevSkip ? '&skip=' + prevSkip : '');
		}
		this.paging = {};
		this.paging.next = nextPageUrl;
		if(prevPageUrl) this.paging.previous = prevPageUrl;
	}
}

function RunAfterProcessing(operation, response, reqInfo) {
	return RunProcessing(false, operation, response, reqInfo);
}

function RunBeforeProcessing(operation, response, reqInfo) {
	return RunProcessing(true, operation, response, reqInfo);
}

function RunProcessing(before, operation, response, reqInfo) {
	var d = Q.defer();
	var processStore = (before ? __app.beforeProcessingFns : __app.afterProcessingFns);
	var path = reqInfo.entityName;

	var process = _.filter(processStore, function(itm) {
		return itm.operation == operation && itm.path == path;
	});

	if(!process || process.length == 0) {
		d.resolve(response);
	} else {
		process[0].func(response, reqInfo, function(err) {
			if(!err) {
				d.resolve(response);
			} else {
				d.reject(err);
			}
		});
	}

	return d.promise;
}

function Entity(index, keyProperty, keyValue) {
	this.index = index;
	this.keyProperty = keyProperty;
	this.keyValue = keyValue;
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

//TODO: switch to turn verbose errors on/off
//Error Response Object
function errorResp(err) {
	return { 
		"error" : err.message,
		"stack" : err.stack
	};
}

