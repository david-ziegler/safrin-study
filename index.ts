import express, { Request, Response } from "express";
const FitbitApiClient = require("fitbit-node");
import dotenv from "dotenv";

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
      console.log("result", result);
      try {
        const sleep = await client.get(
          "/sleep/date/2023-10-30/2023-12-30.json",
          result.access_token
        );

        console.log("done");
        res.send(sleep[0]);
      } catch (error: any) {
        res.status(error.status).send(error);
      }
    })
    .catch((error: any) => {
      res.status(error.status).send(error);
    });
});

app.listen(3001);
