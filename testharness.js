var graphsvc = require('./index')
  , r = require('./lib/request')
  , Q = require('q');

/*var app = graphsvc("http://localhost:7474");
app.entity("/users/fbid");
app.entity("/bands/fbid");
app.entity("/songs/scid");
app.entity("/people/fbid", "person");
app.connection("is_member_of", "/users/fbid/bands", "/bands/fbid/members");
app.connection("is_friends_with", "/users/fbid/friends");
app.listen(3000);

var _req = new app.Request("http://localhost:3000");*/

var _req = new r("http://localhost:3000");

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
	return GetNodeWithNoIncludedRelationships_Test();
}).then(function() {
	return GetNodeWithIncludedOutboundRelationship_Test();
}).then(function() {
	return GetNodeWithIncludedTwoWayRelationship_Test();
}).then(function() {
	return DeleteExistingRelationship_Test();
}).then(function() {
	return DeleteRelationshipThatDNE_Test();
}).then(function() {
	return AddEntityToNonPluralizedIndex_Test();
}).then(function() {
	return AddEntityWithNoDefinedKey_Test();
}).then(function() {
	return CreateEntityRestrictedByRule_Test();
}).then(function() {
	return CreateEntityModifiedByRule_Test();
}).then(function() {
	return NewNodeCreatedForRelationshipRestrictedByRule_Test();
}).then(function() {
	return NewNodeCreatedForRelationshipModifiedByRule_Test();
}).then(function() {
	return GetNodeRestrictedByRule_Test();
}).then(function() {
	return GetNodeModifiedByRule_Test();
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
	}).then(function() {
		return sendAndLogDelete('users/333');
	}).then(function() {
		return sendAndLogDelete('people/335');
	}).then(function() {
		return sendAndLogDelete('things/336');
	});
}
/* delete everything...
START n=node(*)
MATCH n-[r?]-()
WHERE ID(n) <> 0
DELETE n,r
*/

function sendAndLogDelete(url) {
	console.log("DELETING " + url);
	return _req.del(url).then(
		function() { return Q.fcall(function() { return true; }); },
		function(err) { 
			console.log(err.error);
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
	var expected = "CREATE song FAILED: A song with key scid=123 already exists.";
	return _req.post(
		'songs', 
		{ "scid":123, "dont let it": "add me" }
	).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
	});
}

/*
 *	Tries to add a node without a key value
 */
function AddNodeWithNoIndex_Test() {
	var t = "AddNodeWithNoIndex_Test";
	//var expected = "CREATE song FAILED: Required key property scid not found. You must include a value for scid as part of your request.";
	var expected = "Object with scid > 0";
	return _req.post(
		'songs', 
		{ "title": "rocks tonic juice magic", "length": "4:34", "rating": "totally awesome" }
	).then(function(resp) {
		var tst = false;
		try {
			tst = parseInt(resp.body.key) > 0;
		} catch(err) {}
		if(tst) {
			Assert.AreEqual(t, expected, "Object with scid > 0");
		} else {
			Assert.AreEqual(t, expected, resp.body.key);
		}
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
	var expected = "DELETE song FAILED: song with key scid=thisnodedne123 does not exist.";
	return _req.del('songs/thisnodedne123').then(function(r) {
		Assert.AreEqual(t, expected, error);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
	});
}

/*
 *	Try to update a node that doesn't exist
 */
function UpdateNodeThatDNE_Test() {
	var t = "UpdateNodeThatDNE_Test";
	var expected = "UPDATE song FAILED: song with key scid=thisnodedne123 does not exist.";
	return _req.put('songs/thisnodedne123', {"doesnt": "matter"}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
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
		Assert.AreEqual(t, expected, err.error);
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
			Assert.Error(t, err.error);
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
		Assert.Error(t, err.error);
	});
}

/*
 *	Try to add a connection that already exists
 */
function UpdateConnectionWithoutRelationshipProperties_Test() {
	var t = "UpdateConnectionWithoutRelationshipProperties_Test";
	var expected = "UPDATE CONNECTION 'users/101' is_member_of 'bands/103' FAILED: No relationship properties were provided as part of the request";
	
	return _req.post('users/101/bands', {'fbid':103}).then(function(r) {
		if(r && r.body && r.body.error) {
			Assert.AreEqual(t, expected, r.body.error);
		} else {
			Assert.AreEqual(t, expected, r.body);
		}
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
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
		Assert.Error(t, err);
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
		Assert.Error(t, err);
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
		Assert.Error(t, err);
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
		Assert.Error(t, err);
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
		Assert.Error(t, err);
	});
}

/*
 *	Get node with no included relationships
 *
 *	'friends' and 'bands' properties should be url pointers)
 */
function GetNodeWithNoIncludedRelationships_Test() {
	var t = "GetNodeWithNoIncludedRelationships_Test";
	var expected = {
		"fbid":221,"name":"sadie",
		"connections":{
			"bands":"http://localhost:3000/users/221/bands",
			"friends":"http://localhost:3000/users/221/friends"
		}
	};
	
	return _req.post('users/221/bands', {'fbid': 104}).then(function(r) {
		return _req.get('users/221');
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Get node with included outbound relationship 
 *
 *  outbound relationship 'bands' : (user - is_member_of -> band)
 *	'bands' property should be a collection of bands
 */
function GetNodeWithIncludedOutboundRelationship_Test() {
	var t = "GetNodeWithIncludedOutboundRelationship_Test";
	var expected = {
		"fbid":221,"name":"sadie",
		"connections":{
			"bands":[
				{"genre":"graphcore","name":"the moves","fbid":104}
			],
			"friends":"http://localhost:3000/users/221/friends"
		}
	};
	
	return _req.get('users/221?include=bands').then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Get node with included two way relationship
 *
 *  two way relationship 'friends' : (user <- is_friends_with -> user)
 *	'friends' property should be a collection of users
 */
function GetNodeWithIncludedTwoWayRelationship_Test() {
	var t = "GetNodeWithIncludedTwoWayRelationship_Test";
	var expected = {
		"fbid":221,"name":"sadie",
		"connections":{
			"bands":[
				{"genre":"graphcore","name":"the moves","fbid":104}
			],
			"friends":[
				{"fbid":222,"name":"jenny","relationship":{"since":"monday"}},
				{"fbid":223,"name":"amy","relationship":{"since":"tuesday"}}
			]
		}
	};
	
	return _req.get('users/221?include=friends,bands').then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function DeleteExistingRelationship_Test() {
	var t = "DeleteExistingRelationship_Test";
	var expected = [{"name":"the pushpops","fbid":103}];
	
	return _req.post('users/101/bands', {'fbid':109, 'name':'flyswatter'}).then(function(r) {
		return _req.del('users/101/bands/109');
	}).then(function(r) {
		return _req.get('users/101/bands');
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function DeleteRelationshipThatDNE_Test() {
	var t = "DeleteRelationshipThatDNE_Test";
	var expected = "DELETE CONNECTION FAILED: 'users/101' is_member_of 'bands/2345' does not exist.";
	
	return _req.del('users/101/bands/2345').then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
	});
}

/*
 *	
 */
function CheckEmptyObjectReturnedOnGetEntity_Test() {
	var t = "CheckEmptyObjectReturnedOnGetEntity_Test";
	var expected = "{}";
	
	return _req.post('users', {'fbid': 334, 'name': 'piston honda'}).then(function(r) {
		return _req.get('users/333');
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function AddEntityToNonPluralizedIndex_Test() {
	var t = "AddEntityToNonPluralizedIndex_Test";
	var expected = {'fbid':335, 'fullname': 'glen shellingsworth'};
	
	return _req.post('people', {'fbid':335, 'fullname': 'glen shellingsworth'}).then(function(r) {
		return _req.get('people/335');
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function AddEntityWithNoDefinedKey_Test() {
	var t = "AddEntityWithNoDefinedKey_Test";
	var expected = 'orange';
	
	return _req.post('things', {'color':'orange'}).then(function(r) {
		return _req.get('things/' + r.body.key);
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body.color);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function CreateEntityRestrictedByRule_Test() {
	var t = "CreateEntityRestrictedByRule_Test";
	var expected = 'No green things allowed';
	
	return _req.post('things', {'color':'green'}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
	});
}

/*
 *	
 */
function CreateEntityModifiedByRule_Test() {
	var t = "CreateEntityModifiedByRule_Test";
	var expected = true;
	
	return _req.post('things', {'color':'yellow'}).then(function(r) {
		return _req.get('things/' + r.body.key);
	}).then(function(r) {
		var act = (r.body.created && r.body.created.length > 0 ? true : "the 'created' property wasn't added or is empty");
		Assert.AreEqual(t, expected, act);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function NewNodeCreatedForRelationshipRestrictedByRule_Test() {
	var t = "NewNodeCreatedForRelationshipRestrictedByRule_Test";
	var expected = 'That band name sucks';
	
	return _req.post('users/101/bands', {'name':'the beef patties'}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
	});
}

/*
 *	
 */
function NewNodeCreatedForRelationshipModifiedByRule_Test() {
	var t = "NewNodeCreatedForRelationshipModifiedByRule_Test";
	var expected = true;
	
	return _req.post('users/101/bands', {'name':'the smokin joes'}).then(function(r) {
		return _req.get(r.body.connectedEntityUrl);
	}).then(function(r) {
		var act = (r.body.created && r.body.created.length > 0 ? true : "the 'created' property wasn't added or is empty");
		Assert.AreEqual(t, expected, act);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	
 */
function GetNodeRestrictedByRule_Test() {
	var t = "GetNodeRestrictedByRule_Test";
	var expected = "You're not allowed to view red things";
	
	return _req.post('things', {'id': 336, 'color': 'red'}).then(function(r) {
		return _req.get('things/336');
	}).then(function(r) {
		Assert.AreEqual(t, expected, r.body);
	}, function(err) {
		Assert.AreEqual(t, expected, err.error);
	});
}

/*
 *	
 */
function GetNodeModifiedByRule_Test() {
	var t = "GetNodeModifiedByRule_Test";
	var expected = "red(modified)";
	
	return _req.get('things/336?accesstoken=abc123').then(function(r) {
		Assert.AreEqual(t, expected, r.body.color);
	}, function(err) {
		Assert.Error(t, err);
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
Assert.Error = function(testName, err) {
	console.log("X " + testName);
	console.log("");
	console.log("ERROR: " + err.stack);
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