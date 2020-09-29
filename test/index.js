const GrafanaAPIClient = require('../');
const grafana = new GrafanaAPIClient.Client("ZGFkYm90OjYwTHUkUFZJJCpsQGNHMzZacDF1QWVCUmQ=", 0, 2, 'ws://localhost:8080/connect');


grafana.on('remoteEval', (data, callback) => {
    let evaluation;
    try {
        evaluation = eval(data);
    } catch (err) {
        callback(err);
        return;
    }
    callback(null, typeof evaluation !== 'string' ? require('util').inspect(evaluation) : evaluation);
});

grafana.connect();