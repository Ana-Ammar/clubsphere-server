const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5165;

// Middlewire
app.use(cors());
app.use(express.json());

// Mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lh2xuij.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("clubsphere server is running now");
});

async function run() {
  try {
    const db = client.db("clubsphere");
    const usersCollection = db.collection("users");
    const clubsCollection = db.collection("clubs");
    const eventsCollection = db.collection("events");

    // User related apis
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        user.role = "member";
        user.createdAt = new Date();
        const existUser = await usersCollection.findOne({ email: user.email });
        if (existUser) {
          return res.send({ message: "User already exist" });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error in adding user to database:", error);
        res.status(500).send({ message: "Failed to add user" });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching data from usersCollection: ", error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // clubs related apis
    app.get("/clubs", async (req, res) => {
      try {
        const clubs = await clubsCollection.find().toArray();
        res.send(clubs);
      } catch (error) {
        console.error("Error fetching data from clubsCollection: ", error);
        res.status(500).send({ message: "Failed to fetch clubs" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`clubsphere server is running on port: ${port}`);
});
