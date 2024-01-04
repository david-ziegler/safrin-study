import express, { Request, Response } from "express";
const FitbitApiClient = require("fitbit-node");
import dotenv from "dotenv";
import * as fs from "fs";

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

app.get("/authorize", (req: Request, res: Response) => {
  res.redirect(
    client.getAuthorizeUrl(
      "activity heartrate location nutrition profile settings sleep social weight",
      OUR_SERVER_URL
    )
  );
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
          "/sleep/date/2023-10-30/2023-12-30.json",
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
    "minutesDeep",
    "minutesLight",
    "minutesRem",
    "minutesAsleep",
    "minutesRestless",
  ];
  let csv = `${headers.join(",")}\n`;
  data.forEach((row: any) => {
    const stages = row.levels.summary;
    csv += `${row.dateOfSleep},${row.timeInBed},${row.minutesAsleep},${row.minutesAwake},${row.minutesToFallAsleep},${row.efficiency},${stages.deep?.minutes},${stages.light?.minutes},${stages.rem?.minutes},${stages.asleep?.minutes},${stages.restless?.minutes}\n`;
  });
  const filename = "./output/sleep.csv";
  fs.writeFileSync(filename, csv);
  console.log(`Wrote file to ${filename}`);
}

app.listen(3001);
