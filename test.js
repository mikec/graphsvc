var graphsvc = require('./');

var app = graphsvc("http://localhost:7474");

app.addEntity("thing")
   .addEntity("user", {"key": "fbid"})
   .addEntity("band", {"key": "fbid"})
   .addEntity("song", {"key": "scid"})
   .addEntity("person", {"key": "fbid", "collectionName": "people"})
   .addConnection("user.bands", "band.members", "is_member_of")	
   .addConnection("user.friends", "is_friends_with")
   
   .addAccessRule("create", "thing", function(reqInfo, data) {
		if(data.color == 'green') throw new Error("No green things allowed");
		else data.created = new Date().toUTCString();
		return data;
	})
	
   .addAccessRule("create", "band", function(reqInfo, data) {
		if(data.name == "the beef patties") throw new Error("That band name sucks");
		else if(data.name == "the smokin joes") data.created = new Date().toUTCString();
		return data;
	})
	
   .addAccessRule("read", "thing", function(reqInfo, data) {
		if(data.color == "red") {
			if(reqInfo.request.query.accesstoken == "abc123") {
				data.color = "red(modified)";
				return data;
			} else throw new Error("You're not allowed to view red things");
		}
	});

/*
	
	//pagination
	
	//documentation
*/

app.listen(3000);