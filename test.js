var graphsvc = require('./');

var options = {
   "nodeTypes":
   [
      { "name": "user", "key": "fbid" },
      { "name": "band", "key": "fbid" },
      { "name": "song", "key": "scid" }
   ]
}

var app = graphsvc("http://localhost:7474", options);
app.listen(3000);