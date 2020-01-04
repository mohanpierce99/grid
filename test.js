var axios = require('axios');

axios.get('https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=13.0065,80.2447|13.0891,80.2520&destinations=12.997241,80.191764&mode=driving&departure_time='+ +new Date()+'&traffic_model=pessimistic&key=AIzaSyC-9MbkfsOTr2OKxote-YJzqIsq-FnBUdU').then((x)=>{
	console.log(x.data["rows"][0]["elements"][0]["duration_in_traffic"]["text"]);
});
