var graphsvc = require('./');

/*
var options = {
   "entities":
   [
		{ "name": "user", "key": "fbid" },
		{ "name": "band", "key": "fbid" },
		{ "name": "song", "key": "scid" }
   ],
   "connections":
   [
		{ 
		  "name": "is_member_of",
	      "start": { "entity": "user", "name": "members" },
		  "end": { "entity": "band" }
		}
   ]
}*/

/*
{
	startpath: "/users/{fbid}/bands",
	endpath: "/bands/{fbid}/members",
	relationship: is_member_of
}
*/

var app = graphsvc("http://localhost:7474");

/*app.entity("/users/fbid");
app.entity("/bands/fbid");
app.entity("/songs/scid");
app.entity("/people/fbid", "person");*/

//app.entity(name, options)
app.addEntity("thing")
   .addEntity("user", {"key": "fbid"})
   .addEntity("band", {"key": "fbid"})
   .addEntity("song", {"key": "scid"})
   .addEntity("person", {"key": "fbid", "collectionName": "people"});

app.connection("is_member_of", "/users/fbid/bands", "/bands/fbid/members");
app.connection("is_friends_with", "/users/fbid/friends");

/*
	//app.entity(name, options)
	app.addEntity("thing")
	
    //app.addConnection(endpoint1, endpoint2, relationshipName)
	   .addConnection("user/bands", "band/members", "is_member_of")	
	   .addConnection("user/friends", "is_friends_with")
	//Custom CRUD rules for entities
	   .setCreateAccessRule("thing", function(reqInfo) {
			var accessToken = reqInfo.query.accesstoken;
			if(isValidToken(accessToken)) {
				
			}
		})
		.setReadAccessRule("thing", function(reqInfo) {
		
		})
		.setUpdateAccessRule("thing", function(reqInfo) {
			var accessToken = reqInfo.query.accesstoken;
			if(isValidToken(accessToken)) {
				
			}
		})
		.setDeleteAccessRule("thing", function(reqInfo) {
		
		})
		
		//Custom CRUD rules for connections
		.setCreateAccessRule("user", "is_member_of", "band", function(reqInfo) {
			var accessToken = reqInfo.query.accesstoken;
			if(isValidToken(accessToken)) {
				
			}
		})
		.setReadAccessRule("thing", function(reqInfo) {
		
		})
		.setUpdateAccessRule("thing", function(reqInfo) {
			var accessToken = reqInfo.query.accesstoken;
			if(isValidToken(accessToken)) {
				
			}
		})
		.setDeleteAccessRule("thing", function(reqInfo) {
		
		});
	
	function isValidToken(token) {
		if(token == "abc123") return true;
		else return false;
	}
	
	//pagination
	
	//documentation
*/

app.entityRule("GET", "users", function(reqData) {
	var restrictedUserId = 333;
	if(reqData.keyValue == restrictedUserId) {
		throw new Error("You don't have permission to read " + reqData.index + " where " + reqData.keyProperty + "=" + restrictedUserId);
	}
}, true);

app.listen(3000);