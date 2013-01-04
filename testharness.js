var Request = require('./lib/request')
  , Q = require('q');

/*
	service must run on:
	http://localhost:3000
	
	service must be configured as follows
	var app = graphsvc(neo4j_http_service_url);
	app.entity("/users/:fbid");
	app.entity("/bands/:fbid");
	app.entity("/songs/:scid");
	app.entity("/people/:fbid", "person");
	//app.connection("is_member_of", "/users/:fbid/bands", "/bands/:fbid/members");
	app.listen(3000);
*/

var _req = new Request("http://localhost:3000");

//remove any existing nodes from the database that may conflict with tests
cleanDatabase().when(function() {
	console.log("");
	//start running tests in sequence
	console.log("RUNNING TESTS");
	console.log("");
	return AddNode_Test();
}).then(function() {
	return AddNodeWithNoIndex_Test();
}).then(function() {
	return AddDuplicateNode_Test();
}).then(function() {
	return GetNode_Test();
}).then(function() {
	return UpdateNode_Test();
}).then(function() {
	return DeleteNodeProperty_Test();
}).then(function() {
	return DeleteNode_Test();
}).then(function() {
	return DeleteNodeThatDNE_Test();
}).then(function() {
	return UpdateNodeThatDNE_Test();
}).then(function() {
	return AddConnectionToNewNode_Test();
}).then(function() {
	return UpdateConnectionWithoutRelationshipProperties_Test();
}).then(function() {
	return AddConnectionToExistingNode_Test();
}).then(function() {
	return AddConnectionWithProperties_Test();
}).then(function() {
	return AddInboundConnection_Test();
}).then(function() {
	return UpdateExistingConnection_Test();
}).then(function() {
	return AddConnectionBetweenTwoNodesInTheSameIndex_Test();
}).then(function() {
	return GetNodeWithRelationships_Test();
}, function(err) {
	console.log("TESTHARNESS FAILED: " + err);
}).done();

function cleanDatabase() {
	console.log("");
	console.log("CLEANING DATABASE");
	return sendAndLogDelete('songs/123').then(function() {
		return sendAndLogDelete('users/101');
	}).then(function() {
		return sendAndLogDelete('users/102');
	}).then(function() {
		return sendAndLogDelete('users/103');
	}).then(function() {
		return sendAndLogDelete('users/111');
	}).then(function() {
		return sendAndLogDelete('bands/102');
	}).then(function() {
		return sendAndLogDelete('bands/103');
	}).then(function() {
		return sendAndLogDelete('bands/104');
	}).then(function() {
		return sendAndLogDelete('bands/105');
	}).then(function() {
		return sendAndLogDelete('users/221');
	}).then(function() {
		return sendAndLogDelete('users/222');
	}).then(function() {
		return sendAndLogDelete('users/223');
	});
}
function sendAndLogDelete(url) {
	console.log("DELETING " + url);
	return _req.del(url).then(
		function() { return Q.fcall(function() { return true; }); },
		function(err) { 
			console.log(err);
			return Q.fcall(function() { return true; });
		}
	);
}

/*
 *	Adds a node, then gets that node to see if it exists
 */
function AddNode_Test() {
	var t = "AddNode_Test";
	var expected = { "scid":123, "title": "rocks tonic juice magic", "length": "4:34", "rating": "totally awesome" };
	return _req.post(
		'songs', 
		{ "scid":123, "title": "rocks tonic juice magic", "length": "4:34", "rating": "totally awesome" }
	).then(function() {
		return _req.get('songs/123').then(function(r) {
			Assert.AreEqual(t, expected, r.body);
		});
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Tries to add a duplicate node
 */
function AddDuplicateNode_Test() {
	var t = "AddDuplicateNode_Test";
	var expected = "Error: CREATE song FAILED: A song with key scid=123 already exists.";
	return _req.post(
		'songs', 
		{ "scid":123, "dont let it": "add me" }
	).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.toString());
	});
}

/*
 *	Tries to add a node without a key value
 */
function AddNodeWithNoIndex_Test() {
	var t = "AddNodeWithNoIndex_Test";
	var expected = "Error: CREATE song FAILED: Required key property scid not found. You must include a value for scid as part of your request.";
	return _req.post(
		'songs', 
		{ "title": "rocks tonic juice magic", "length": "4:34", "rating": "totally awesome" }
	).then(function(resp) {
		Assert.AreEqual(t, expected, resp.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.toString());
	});
}

/*
 *	Update an existing node's properties
 */
function UpdateNode_Test() {
	var t = "UpdateNode_Test";
	var expected = { "scid":123, "title": "the ocean", "length": "4:34", "rating": "epic" };
	return _req.put(
		'songs/123', 
		{ "scid":123, "title": "the ocean", "rating": "epic" }
	).then(function() {
		return _req.get('songs/123').then(function(r) {
			Assert.AreEqual(t, expected, r.body);
		});
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Delete properties from a node, and add a few too
 */
function DeleteNodeProperty_Test() {
	var t = "DeleteNodeProperty_Test";
	var expected = { "scid":123, "title": "eye of the tiger", "rating": "great", "tomatoes": "are good" };
	return _req.put(
		'songs/123', 
		{ "scid":123, "title": "eye of the tiger", "length": null, "rating": "great", "tomatoes": "are good" }
	).then(function() {
		return _req.get('songs/123').then(function(r) {
			Assert.AreEqual(t, expected, r.body);
		});
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Delete a node
 */
function DeleteNode_Test() {
	var t = "DeleteNode_Test";
	var expected = {};
	return _req.del('songs/123').then(function() {
		return _req.get('songs/123');
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Try to delete a node that doesn't exist
 */
function DeleteNodeThatDNE_Test() {
	var t = "DeleteNodeThatDNE_Test";
	var expected = "Error: DELETE song FAILED: song with key scid=thisnodedne123 does not exist.";
	return _req.del('songs/thisnodedne123').then(function(r) {
		Assert.AreEqual(t, expected, error);
	}, function(err) {
		Assert.AreEqual(t, expected, err.toString());
	});
}

/*
 *	Try to update a node that doesn't exist
 */
function UpdateNodeThatDNE_Test() {
	var t = "UpdateNodeThatDNE_Test";
	var expected = "Error: UPDATE song FAILED: song with key scid=thisnodedne123 does not exist.";
	return _req.put('songs/thisnodedne123', {"doesnt": "matter"}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.toString());
	});
}

/*
 *	Get a node that doesn't exist
 */
function GetNode_Test() {
	var t = "GetNode_Test";
	var expected = {};
	return _req.get('songs/thisnodedne123').then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.toString());
	});
}

/*
 *	Add a connection from an existing node to a new node
 */
function AddConnectionToNewNode_Test() {
	var t = "AddConnectionToNewNode_Test";
	
	var membersResp = null;
	var bandsResp = null;
	
	var expected = {
		"bandsResp": [{'fbid':103, 'name':'the pushpops'}],
		"membersResp": [{'fbid':101, 'name':'joe'}]
	};
	return _req.post('users', {'fbid':101, 'name':'joe'}).then(
		function(r) {
			return Q.fcall(function() { return true; });
		}, function(err) {
			return Q.fcall(function() { return true; });
		}
	).then(function() {
		return _req.post('users/101/bands', {'fbid':103, 'name':'the pushpops'});
	}).then(
		function(r) {
			return _req.get('users/101/bands');
		}, function(err) {
			Assert.Error(t, err.toString());
		}
	).then(function(r) {
		bandsResp = r;
		return _req.get('bands/103/members');
	}).then(function(r) {
		membersResp = r;
		var actual = {
			"bandsResp": bandsResp.body,
			"membersResp": membersResp.body
		};
		Assert.AreEqual(t, expected, actual);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}

/*
 *	Try to add a connection that already exists
 */
function UpdateConnectionWithoutRelationshipProperties_Test() {
	var t = "UpdateConnectionWithoutRelationshipProperties_Test";
	var expected = "Error: UPDATE CONNECTION 'users/101' is_member_of 'bands/103' FAILED: No relationship properties were provided as part of the request";
	
	return _req.post('users/101/bands', {'fbid':103}).then(function(r) {
		if(r && r.body && r.body.error) {
			Assert.AreEqual(t, expected, r.body.error);
		} else {
			Assert.AreEqual(t, expected, r.body);
		}
	}, function(err) {
		Assert.AreEqual(t, expected, err);
	});
}

/*
 *	Add a connection between two existing nodes
 */
function AddConnectionToExistingNode_Test() {
	var t = "AddConnectionToExistingNode_Test";
	var expected = {
		"bandsResp": [{'fbid':104, 'name':'the moves', 'genre':'graphcore'}],
		"membersResp": [{'fbid':102, 'name':'dave'}]
	};
	
	return _req.post('bands', {'fbid':104, 'name':'the moves', 'genre':'graphcore'}).then(
		function(r) { return true; }, function(err) { return true; }
	).when(function() {
		return _req.post('users', {'fbid':102, 'name':'dave'});
	}).then(function() {
		return _req.post('users/102/bands', {'fbid':104});
	}).then(function(r) {
		return _req.get('users/102/bands');
	}).then(function(r) {
		bandsResp = r;
		return _req.get('bands/104/members');
	}).then(function(r) {
		membersResp = r;
		var actual = {
			"bandsResp": bandsResp.body,
			"membersResp": membersResp.body
		};
		Assert.AreEqual(t, expected, actual);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}

/*
 *	Add a connection with relationship properties
 */
function AddConnectionWithProperties_Test() {
	var t = "AddConnectionWithProperties_Test";
	var expected = {
		"bandsResp": [{'fbid':104, 'name':'the moves', 'genre':'graphcore', 'relationship':{'since':'today','instrument':'drums'}}],
		"membersResp": [{"name":"dave","fbid":102},{'fbid':103, 'name':'jamal', 'relationship':{'since':'today','instrument':'drums'}}]
	};
	
	return _req.post('bands', {'fbid':104, 'name':'the moves', 'genre':'graphcore'}).then(
		function(r) { return true; }, function(err) { return true; }
	).when(function() {
		return _req.post('users', {'fbid':103, 'name':'jamal'});
	}).then(function() {
		return _req.post('users/103/bands', {'fbid':104, 'relationship':{'since':'today','instrument':'drums'}});
	}).then(function(r) {
		return _req.get('users/103/bands');
	}).then(function(r) {
		bandsResp = r;
		return _req.get('bands/104/members');
	}).then(function(r) {
		membersResp = r;
		var actual = {
			"bandsResp": bandsResp.body,
			"membersResp": membersResp.body
		};
		Assert.AreEqual(t, expected, actual);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}

/*
 *	Add an inbound connection
 */
function AddInboundConnection_Test() {
	var t = "AddInboundConnection_Test";
	var expected = {
		"bandsResp": [{'fbid':105, 'name':'sunny side up', 'relationship':{'since':'always'}}],
		"membersResp": [{"name":"george","fbid":111, 'relationship':{'since':'always'}}]
	};
	
	var bandsResp = null;
	var membersResp = null;
	
	return _req.post('bands', {'fbid':105, 'name':'sunny side up'}).fin(function() {
		return _req.post('users', {"name":"george","fbid":111});
	}).fin(function() {
		return _req.post('bands/105/members', {"fbid":111, 'relationship':{'since':'always'}});
	}).then(function() {
		return _req.get('users/111/bands');
	}).then(function(r) {
		bandsResp = r;
		return _req.get('bands/105/members');
	}).then(function(r) {
		membersResp = r;
		var actual = {
			"bandsResp": bandsResp.body,
			"membersResp": membersResp.body
		};
		Assert.AreEqual(t, expected, actual);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}

/*
 *	Update an existing connection
 */
function UpdateExistingConnection_Test() {
	var t = "UpdateExistingConnection_Test";
	var expected = {
		"bandsResp": [{'fbid':105, 'name':'sunny side up', 'relationship':{'since':'a long time', 'comment':'verycool'}}],
		"membersResp": [{"name":"george","fbid":111, 'relationship':{'since':'a long time', 'comment':'verycool'}}]
	};
	
	var bandsResp = null;
	var membersResp = null;
	
	return _req.post(
		'bands/105/members', 
		{"fbid":111, 'relationship':{'comment':'verycool', 'since':'a long time'}}
	).then(function() {
		return _req.get('users/111/bands');
	}).then(function(r) {
		bandsResp = r;
		return _req.get('bands/105/members');
	}).then(function(r) {
		membersResp = r;
		var actual = {
			"bandsResp": bandsResp.body,
			"membersResp": membersResp.body
		};
		Assert.AreEqual(t, expected, actual);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}

/*
 *	Add a connection between two nodes from the same index
 */
function AddConnectionBetweenTwoNodesInTheSameIndex_Test() {
	var t = "AddConnectionBetweenTwoNodesInTheSameIndex_Test";
	var expected = {
		"r1": [{'name':'sadie', 'fbid':221, "relationship": { "since":"monday"}}],
		"r2": [{"name":"jenny", "fbid":222, "relationship": { "since":"monday"}}, {"name":"amy", "fbid":223, "relationship": { "since":"tuesday"}}]
	};
	
	var bandsResp = null;
	var membersResp = null;
	
	return _req.post('users', {'name':'sadie', 'fbid':221}).fin(function() {
		return _req.post('users/221/friends', {"name":"jenny", "fbid":222, "relationship": { "since":"monday"}});
	}).then(function(r) {
		return _req.post('users/221/friends', {"name":"amy", "fbid":223, "relationship": { "since":"tuesday"}});
	}).then(function(r) {
		return _req.get('users/222/friends');
	}).then(function(s) {
		r1 = s;
		return _req.get('users/221/friends');
	}).then(function(r) {
		r2 = r;
		var actual = {
			"r1": r1.body,
			"r2": r2.body
		};
		Assert.AreEqual(t, expected, actual);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}

/*
 *	Get node with relationships 
 */
function GetNodeWithRelationships_Test() {
	var t = "GetNodeWithRelationships_Test";
	var expected = {};
	
	return _req.get('users/221?include=friends,bands').then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err.toString());
	});
}




var Assert = {};
Assert.AreEqual = function(testName, expected, actual) {
	if(Object.identical(expected, actual)) {
		console.log("O " + testName);
	} else {
		console.log("X " + testName);
		console.log("");
		console.log("EXPECTED: " + JSON.stringify(expected));
		console.log("ACTUAL: " + JSON.stringify(actual));
		console.log("");
	}
}
Assert.Error = function(testName, errMsg) {
	console.log("X " + testName);
	console.log("");
	console.log("ERROR: " + errMsg);
	console.log("");
}

/*
    Original script title: "Object.identical.js"; version 1.12
    Copyright (c) 2011, Chris O'Brien, prettycode.org
    http://github.com/prettycode/Object.identical.js
*/

Object.identical = function (a, b, sortArrays) {
        
    function sort(object) {
        if (sortArrays === true && Array.isArray(object)) {
            return object.sort();
        }
        else if (typeof object !== "object" || object === null) {
            return object;
        }

        return Object.keys(object).sort().map(function(key) {
            return {
                key: key,
                value: sort(object[key])
            };
        });
    }
    
    return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
};