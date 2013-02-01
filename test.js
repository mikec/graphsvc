var graphsvc = require('./');

var app = graphsvc("http://localhost:7474");

app.addEntity("thing")
   .addEntity("user", {"key": "fbid"})
   .addEntity("band", {"key": "fbid"})
   .addEntity("song", {"key": "scid"})
   .addEntity("person", {"key": "fbid", "collectionName": "people"})
   .addConnection("user.bands", "band.members", "is_member_of")	
   .addConnection("user.friends", "is_friends_with")
   .addConnection("thing.parts", "has_part")
   
   .addAccessRule("create", "thing", function(reqInfo, entityData) {
		if(!entityData) return;
		if(entityData.color == 'green') throw new Error("No green things allowed");
		else entityData.created = new Date().toUTCString();
	})
	
   .addAccessRule("create,update,delete", "band", function(reqInfo, entityData) {
		if(!entityData) return;
		if(entityData.name == "the beef patties") throw new Error("That band name sucks");
		else if(entityData.name == "the smokin joes") entityData.created = new Date().toUTCString();
	})
	
   .addAccessRule("read", "thing", function(reqInfo, entityData) {
		if(!entityData) return;
		if(entityData.color == "red") {
			if(reqInfo.request.query.accesstoken == "abc123") {
				entityData.color = "red(modified)";
			} else throw new Error("You're not allowed to view red things");
		}
	})
   
   .addAccessRule("create", "user.bands", function(reqInfo, baseEntityData, connectedEntityData, connectionData) {
		if(!baseEntityData || !connectedEntityData || !connectionData) return;
		if(baseEntityData.fbid == 444 && connectedEntityData.fbid == 445 && connectionData.instrument == "maracas") throw new Error("user[fbid=444] can't play maracas for band[fbid=445]");
	})
   
   .addAccessRule("create", "band.members", function(reqInfo, baseEntityData, connectedEntityData, connectionData) {
		if(!baseEntityData || !connectedEntityData || !connectionData) return;
		if(baseEntityData.fbid == 445 && connectedEntityData.fbid == 446 && connectionData.instrument == "maracas") throw new Error("band[fbid=445] can't let user[fbid=444] play maracas");
	});

/*
	
	//pagination
	
	//documentation
*/

app.listen(3000);