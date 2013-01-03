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
app.listen(3000);