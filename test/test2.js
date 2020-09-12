let GrafanaAPIClient = require('..');
const grafana = new GrafanaAPIClient.Client("ZGFkYm90OjYwTHUkUFZJJCpsQGNHMzZacDF1QWVCUmQ=", 1, 2, 'ws://localhost:8080/connect');

let array = [];

grafana.on('allReady', () => {
    let i = 0;
    function cheese() {
        if (i === grafana.clusterID) {
            array.push([[i, `lol${i}`]]);
            i++;
            cheese();
            return;
        };
        grafana.remoteEval(i,
            `let map = new Map();
map.set(${i},"lol${i}");
JSON.stringify(Array.from(map.entries()));`
        ).then(data => {
            array.push(...JSON.parse(data));
            i++;
            if (i < grafana.clusterCount) {
                array.push([grafana.clusterID, `lol${grafana.clusterID}`]);
                let lol = new Map(array);
                console.log('map', lol);
            } else {
                cheese();
            }

        });
    }
    cheese();
});

grafana.connect();