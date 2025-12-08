const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const membershipsCollection = db.collection("memberships")
    const eventsCollection = db.collection("events");
    const eventRegistrationsCollection = db.collection("eventRegistrations")

    // User related apis
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "member";
      user.createdAt = new Date();
      const existUser = await usersCollection.findOne({ email: user.email });
      if (existUser) {
        return res.send({ message: "User already exist" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // clubs related apis
    app.get("/clubs", async (req, res) => {
      const query = {};
      const { managerEmail } = req.query;
      if (managerEmail) {
        query.managerEmail = managerEmail;
      }
      const clubs = await clubsCollection.find(query).toArray();
      res.send(clubs);
    });

    app.get("/clubs/:id", async (req, res) => {
      const club = await clubsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(club);
    });

    app.post("/clubs", async (req, res) => {
      const club = req.body;
      club.status = "pending";
      club.createdAt = new Date();
      const result = await clubsCollection.insertOne(club);
      res.send(result);
    });

    app.patch("/clubs/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const update = { $set: data };
      const result = await clubsCollection.updateOne(query, update);
      res.send(result);
    });

    // For status update (Admin)
    app.patch("/clubs/:id/status", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const { status } = req.body;
      const updateStatus = { $set: { status } };
      const result = await clubsCollection.updateOne(query, updateStatus);
      res.send(result);
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
