import express, { Request, Response } from "express";
const FitbitApiClient = require("fitbit-node");
import dotenv from "dotenv";
import * as fs from "fs";
import https from "https";

dotenv.config();
const {
  FITBIT_CLIENT_ID,
  FITBIT_CLIENT_SECRET,
  FITBIT_API_VERSION,
  OUR_SERVER_URL,
} = process.env;

const app = express();

console.log("Starting...");
console.log(`Fitbit API version: ${FITBIT_API_VERSION}`);
console.log(`Fitbit client ID: ${FITBIT_CLIENT_ID}`);
console.log(`Go to ${OUR_SERVER_URL}/authorize`);

const client = new FitbitApiClient({
  clientId: FITBIT_CLIENT_ID,
  clientSecret: FITBIT_CLIENT_SECRET,
  apiVersion: FITBIT_API_VERSION,
});

const sslOptions = {
  key: fs.readFileSync("/etc/ssl/private/server-key_nopass.pem"),
  cert: fs.readFileSync(
    "/etc/ssl/certs/vm188165-lw_hosting_uni-hannover_de.pem"
  ),
};

https.createServer(sslOptions, app).listen(3001, () => {
  console.log("Server is running on port 3001 with HTTPS");
});

app.get("/authorize", (req: Request, res: Response) => {
  res.redirect(client.getAuthorizeUrl("sleep heartrate", OUR_SERVER_URL));
});

// handle the callback from the Fitbit authorization flow
app.get("/", (req, res) => {
  console.log("retrieving data...");
  // exchange the authorization code we just received for an access token
  client
    .getAccessToken(req.query.code, OUR_SERVER_URL)
    .then(async (result: any) => {
      console.log("result:", result);
      try {
        const sleep = await client.get(
          "/sleep/date/2023-10-30/2024-01-31.json",
          result.access_token
        );

        writeToCsv(sleep[0].sleep);
        res.send(
          `Vielen Dank! Die Autorisierung war erfolgreich. Bitte geben Sie folgende User-ID im Teilnahmeformular ein: 
          ${result.user_id}`
        );
      } catch (error: any) {
        res.status(error.status).send(error);
      }
    })
    .catch((error: any) => {
      res.status(error.status).send(error);
    });
});

function writeToCsv(data: any) {
  const headers = [
    "dateOfSleep",
    "timeInBed",
    "minutesAsleep",
    "minutesAwake",
    "minutesToFallAsleep",
    "efficiency",
    "deep: count",
    "deep: minutes",
    "deep: thirtyDayAvgMinutes",
    "light: count",
    "light: minutes",
    "light: thirtyDayAvgMinutes",
    "rem: count",
    "rem: minutes",
    "rem: thirtyDayAvgMinutes",
    "wake: count",
    "wake: minutes",
    "wake: thirtyDayAvgMinutes",
    "asleep: count",
    "asleep: minutes",
    "restless: count",
    "restless: minutes",
  ];
  let csv = `${headers.join(",")}\n`;
  data.forEach((row: any) => {
    const stages = row.levels.summary;
    csv += `${row.dateOfSleep},${row.timeInBed},${row.minutesAsleep},${row.minutesAwake},${row.minutesToFallAsleep},${row.efficiency},${stages.deep?.count},${stages.deep?.minutes},${stages.deep?.thirtyDayAvgMinutes},${stages.light?.count},${stages.light?.minutes},${stages.light?.thirtyDayAvgMinutes},${stages.rem?.count},${stages.rem?.minutes},${stages.rem?.thirtyDayAvgMinutes},${stages.wake?.count},${stages.wake?.minutes},${stages.wake?.thirtyDayAvgMinutes},${stages.asleep?.count},${stages.asleep?.minutes},${stages.restless?.count},${stages.restless?.minutes}\n`;
  });
  const filename = "./output/sleep.csv";
  fs.writeFileSync(filename, csv);
  console.log(`Wrote file to ${filename}`);
}
