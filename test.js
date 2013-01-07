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

app.entity("/users/fbid");
app.entity("/bands/fbid");
app.entity("/songs/scid");
app.entity("/people/fbid", "person");

app.connection("is_member_of", "/users/fbid/bands", "/bands/fbid/members");
app.connection("is_friends_with", "/users/fbid/friends");

app.entityRule("GET", "users", function(reqData) {
	var restrictedUserId = 333;
	if(reqData.keyValue == restrictedUserId) {
		throw new Error("You don't have permission to read " + reqData.index + " where " + reqData.keyProperty + "=" + restrictedUserId);
	}
}, true);

app.listen(3000);