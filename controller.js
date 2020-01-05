var {
    firebase,
    db
} = require('./init');
var _ = require('lodash');
var axios = require('axios');


let t = 1800; // Time limit for every order

var dataDict = [];

function storeInit(json) { // API function for onboarding
    for (data of json.branches) {
        console.log(json.delB);
        db.collection(json.name).doc(data.name + "_" + data.pin).set({
            pincode: data.pin,
            name: data.name + "_" + data.pin,
            lat: data.lat,
            lng: data.lng,
            limit: data.limit,
            delB: json.delB,
            load: {}
        })
    }
}

async function getLogs(store, keys) { // get Store info
    let mydocs = []
    if (keys == undefined) {
        let qs = await db.collection(store).get();
        return qs.docs;
    }
    for (key of keys) {
        let doc = await db.collection(store).doc(key).get()
        mydocs.push(doc)
    }
    return mydocs;
}

async function brain(lat, lng) {

    let arr = await getLogs("McDonalds");
    let mainArr = [];
    arr.forEach(x => {
        mainArr.push(x.data())
    });

    db.collection("live").doc(lat + "_" + lng).set({
        lat,
        lng,
        serve: false
    });


    let L1filteredBranches = L1calc(mainArr,lat,lng)

    let cacheFlag;

    if ((cacheFlag = check(lat, lng))) {

        //Cache HIT

        cacheFlag.data.forEach(ele => {
            L1filteredBranches.forEach(sub => {
                if (sub.name == ele.name) {
                    ele.load = sub.load;
                    ele.delB = sub.delB;
                    return;
                }
            })
        });
        L2calc(cacheFlag.data, lat, lng);
    } else { // Cache MISS

        await ETAcalc(L1filteredBranches, [{
            lat,
            lng
        }]);

        dataDict.push({
            data: L1filteredBranches,
            lat,
            lng
        })
        //update cache        
        return L2calc(L1filteredBranches, lat, lng)
    }

}




function check(lt, ln) { // Function which checks if result exists in cache
    let least = 500;
    let filt = dataDict.filter(x => {
        let imp = convertToM(x.lat, x.lng, lt, ln);
        if (least >= imp) {
            least = imp;
            return true;
        }
    });
    if (filt.length == 0) {
        return false;
    } else {
        return filt[filt.length - 1];
    }
}

function L1calc(mainArr,lat,lng) { // 1st layer filtering algorithm ( Pure function -- Functional programming)

    let L1filteredBranches = _.chain(mainArr)
        .filter(x => x.limit != x.load["05/01/2020"] && x.delB != 0)
        .map((branch) => (branch.distance = convertToM(lat, lng, branch.lat, branch.lng), branch)) //Distance calc
        .sortBy(branch => branch.distance)
        .filter((x, i, a) => i <= Math.ceil(a.length * 0.5) - 1)
        .value();

    return L1filteredBranches;
}

function L2calc(L1filteredBranches,lat,lng) { // 2nd Layer decision Tree To judge,assert and allocate
    let L2filteredBranches = _.chain(L1filteredBranches)
        .sortBy(branch => branch["ETA"])
        .filter(x => x["ETA"] <= (t - 300))
        .value()

    if (L2filteredBranches.length >= 2) {
        L2filteredBranches.forEach((l) => {
            l.magic = l.limit - l.load["05/01/2020"]
        });

        let finalFiltered = _.chain(L2filteredBranches).sortBy(branch => branch.magic).value().reverse();
        if (finalFiltered[0].magic > finalFiltered[1].magic) {
            console.log("lol")
            console.log(finalFiltered[0].load,"====?",finalFiltered[0].load["05/01/2020"]+1);
            incLoad(finalFiltered[0].name,finalFiltered[0].load["05/01/2020"]+1);
            decDelB(finalFiltered[0].name, finalFiltered[0].lat, finalFiltered[1].lng,lat,lng);
            return finalFiltered[0]
        } else {
            let needed = finalFiltered[0].magic
            finalFiltered = finalFiltered.filter(x => x.magic == needed)
            console.log(dataDict);
            let assignedBatch = _.chain(finalFiltered).sortBy(x => x.limit).value().reverse()[0];
            console.log(assignedBatch.load["05/01/2020"]+1+"fucker1");
            incLoad(assignedBatch.name,assignedBatch.load["05/01/2020"]+1);
            decDelB(assignedBatch.name, assignedBatch.lat, assignedBatch.lng,lat,lng);
            return assignedBatch;
        }
    } else {
        console.log(L2filteredBranches[0].load["05/01/2020"]+1+"two")
        incLoad(L2filteredBranches[0].name,L2filteredBranches[0].load["05/01/2020"]+1);
        decDelB(L2filteredBranches[0].name, L2filteredBranches[0].lat, L2filteredBranches[0].lng,lat,lng);
        return L2filteredBranches[0]
    }
}

function incLoad(branch,nos) { //util function that increases the load
    upLoads("McDonalds", [
        [branch,nos]
    ])
}


function decDelB(branch,rlat,rlng,lat, lng) {
    updelB("McDonalds", [
        [branch]
    ]);
    db.collection("live").doc(lat + "_" + lng).update({
        serve: true,
        rlat,
        rlng
    });
}


function convertToM(lat, long, lat1, long1) { //Math function to calculate Distance between two nodes in metres

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



async function ETAcalc(source, dest) { //Api call for Distance Matrix

    var url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${strUtils(source)}&destinations=${strUtils(dest)}&mode=driving&departure_time=${Math.floor(+new Date()/1000)}&traffic_model=pessimistic&key=AIzaSyC-9MbkfsOTr2OKxote-YJzqIsq-FnBUdU`;

    let response = await axios.get(url)

    response.data["rows"].forEach((x, i) => {
        source[i]["ETA"] = x["elements"][0]["duration_in_traffic"]["value"];
        source[i]["realDistance"] = x["elements"][0]["distance"]["value"];
    });

    return true;
}


function strUtils(arr) { //Utils function for preparing api hit
    var target = "";
    arr.forEach((x, i, a) => {
        target += x.lat + ',' + x.lng;
        if (i != a.length - 1) {
            target += "|"
        };
    });
    return target;
}


async function upLoads(store, obj, i,nos) { //Change Load api

    obj.forEach((x) => {
        if (x[1] == undefined) {
            if (i != undefined) {
                console.log("in");
                db.collection(store).doc(x[0]).update({
                    load: {
                        "05/01/2020": nos
                    }
                });
                return;
            }
            db.collection(store).doc(x[0]).update({
                load: {
                    "05/01/2020": nos
                }
            })
        } else {
            db.collection(store).doc(x[0]).update({
                load: {
                    "05/01/2020": x[1]
                }
            })
        }

    });
}


function updelB(store, obj, i) { // Change delivery boy count
    console.log("hit", store, obj[0]);
    obj.forEach((x) => {
        if (x[1] == undefined) {
            if (i != undefined) {
                db.collection(store).doc(x[0]).update({

                    "delB": firebase.firestore.FieldValue.increment(1)

                });
                return;
            }
            console.log(store, x[0]);
            db.collection(store).doc(x[0]).update({
                "delB": firebase.firestore.FieldValue.increment(-1)
            })
        } else {
            db.collection(store).doc(x[0]).update({

                "delB": x[1]

            })
        }

    });

}


module.exports = {
    updelB,
    upLoads,
    getLogs,
    storeInit,
    brain
}