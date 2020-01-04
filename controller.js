var db = require('init');
var _ = require('lodash');
var axios = require('axios');

let t = 1800;
var dataDict=[];

function storeInit(json) {
    for (data in json.branches) {
        db.collection(json.name).doc(data.name + "_" + data.pin).set({
            pincode: data.pin,
            name: data.name+"_"+data.pin,
            lat: data.lat,
            city: data.city,
            lng: data.lng,
            limit: data.limit,
            delB: data.force,
            load: {}
        })
    }
}


async function getLogs(store, keys) {
    let mydocs = []
    if (keys.length === 0) {
        let qs = await db.collection(store).get();
        return qs.docs;
    }
    for (key of keys) {
        let doc = await db.collection(store).doc(key).get()
        mydocs.push(doc)
    }
    return mydocs;
}

function brain(lat, lng) {

    let L1filteredBranches = _.chain(getLogs())
        .filter(x => x.limit != x.load[new Date().toLocaleDateString()] && x.delB != 0)
        .map((branch) => (branch.distance = distanceCalc(lat, branch.lat, lng, branch.lng), branch))
        .sortBy(branch => branch.distance)
        .filter((x, i, a) => i <= Math.ceil(a.length * 0.5) - 1)
        .value();
        let gomma;

        if((gomma = check(lat,lng))){
            //cache exitsts
            gomma.data.forEach(ele => {
                L1filteredBranches.forEach(sub => {
                    if(sub.name == ele.name){
                        ele.load=sub.load;
                        ele.delB = sub.delB;
                        break;
                    }
                })
            });
            L2calc(gomma.data);
        }else{

            ETAcalc(L1filteredBranches, [{
                lat,
                lng
            }]);
            dataDict.push({data:L1filteredBranches,
                            lat,lng})
            //update cash        
            L2calc(L1filteredBranches)
        }




   

   
}


function check(lt,ln){
    let least= 500;
    let filt=dataDict.filter(x=>{
        let imp = convertToM(x.lat,x.lng,lt,ln);
        if(least >= imp){
            least= imp;
            return true;
        }
    });
    if (filt.length==0){
         return false;
    }
    else{
         return filt[filt.length-1];
    }
}


function L2calc(L1filteredBranches){
    let L2filteredBranches = _.chain(L1filteredBranches)
    .sortBy(branch => branch["ETA"])
    .filter(x => x["ETA"] <= (t - 300))
    .value()

if (L2filteredBranches.length >= 2) {
    L2filteredBranches.forEach((l) => {
        l.magic = l.limit - x.load[new Date().toLocaleDateString()]
    });

    let finalFiltered = __.chain(L2filteredBranches).sortBy(branch => branch.magic).reverse();

    if (finalFiltered[0].magic > finalFiltered[1].magic) {
        return finalFiltered[0]
    } else {
        let needed = finalFiltered[0].magic
        finalFiltered = finalFiltered.filter(x => x.magic == needed)
        return _.chain(finalFiltered).sortBy(x => x.limit).reverse()[0]
    }
} else {
    return L2filteredBranches[0]
}
}


function convertToM(lat, long, lat1, long1) {

    function toRadians(l) {
        return (Math.PI * l) / 180;
    }

    var R = 6371e3; 
    var φ1 = toRadians(lat);
    var φ2 = toRadians(lat1);
    var Δφ = toRadians((lat1 - lat));
    var Δλ = toRadians((long1 - long));
    var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;

    return d;

};






async function ETAcalc(source, dest) {

    var url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${strUtils(source)}&destinations=${strUtils(dest)}&mode=driving&departure_time=1578165479&traffic_model=pessimistic&key=${process.env.KEY}`;

    let response = await axios.get(url)

    response.data["rows"].forEach((x, i) => {
        source[i]["ETA"] = x["elements"][0]["duration_in_traffic"]["value"];
        source[i]["realDistance"] = x["elements"][0]["distance"]["value"];
    });


}


function strUtils(arr) {
    var target = "";
    arr.forEach((x, i, a) => {
        target += x.lat = ',' + x.lng;
        if (i != a.length - 1) {
            target += "|"
        };
    });
    return target;
}


function distanceCalc(x1, x2, y1, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}


function updateLog() {

}