var Request = require('./lib/request');

/*
	service must run on:
	http://localhost:3000
	
	service must be configured with the following options:
	var options = {
	   "nodeTypes":
	   [
		  { "name": "user", "key": "fbid" },
		  { "name": "band", "key": "fbid" },
		  { "name": "song", "key": "scid" }
	   ]
	}
*/

var _req = new Request("http://localhost:3000");

//remove any existing nodes from the database that may conflict with tests
cleanDatabase().then(function() {
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
}, function(err) {
	console.log("TESTHARNESS FAILED: " + err);
}).done();

function cleanDatabase() {
	console.log("CLEANING DATABASE");
	console.log("");
	return _req.del('songs/123');
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
		var error = (r.body && r.body.error ? r.body.error : r.body.toString());
		Assert.AreEqual(t, expected, error);
	}, function(err) {
		Assert.Error(t, err);
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
		var error = (resp.body && resp.body.error ? resp.body.error : resp.body.toString());
		Assert.AreEqual(t, expected, error);
	}, function(err) {
		Assert.Error(t, err);
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
		var error = (r.body && r.body.error ? r.body.error : r.body.toString());
		Assert.AreEqual(t, expected, error);
	}, function(err) {
		Assert.Error(t, err);
	});
}

/*
 *	Try to update a node that doesn't exist
 */
function UpdateNodeThatDNE_Test() {
	var t = "UpdateNodeThatDNE_Test";
	var expected = "Error: PUT song FAILED: song with key scid=thisnodedne123 does not exist.";
	return _req.put('songs/thisnodedne123', {"doesnt": "matter"}).then(function(r) {
		var error = (r.body && r.body.error ? r.body.error : r.body.toString());
		Assert.AreEqual(t, expected, error);
	}, function(err) {
		Assert.Error(t, err);
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