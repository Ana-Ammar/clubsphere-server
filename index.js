const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 5165;
const admin = require("firebase-admin");
var serviceAccount = require("./firebase-admin-key.json");

// initialize firebase credential
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middlewire
app.use(cors());
app.use(express.json());

// Firebase Token verify
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
  } catch (error) {}
  next();
};

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
    const membershipsCollection = db.collection("memberships");
    const eventsCollection = db.collection("events");
    const eventRegistrationsCollection = db.collection("eventRegistrations");
    const paymentsCollecttion = db.collection("payments");

    // Verify admin middlewire
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Verify admin middlewire
    const verifyManager = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "clubManager") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // admin summary apis
    app.get("/admin-summary", verifyFBToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.countDocuments();
      const totalClubs = await clubsCollection.countDocuments();
      const approvedClubs = await clubsCollection.countDocuments({
        status: "approved",
      });
      const pendingClubs = await clubsCollection.countDocuments({
        status: "pending",
      });
      const rejectedClubs = await clubsCollection.countDocuments({
        status: "rejected",
      });
      const members = await membershipsCollection.countDocuments();
      const events = await eventsCollection.countDocuments();
      res.send({
        users,
        totalClubs,
        approvedClubs,
        pendingClubs,
        rejectedClubs,
        members,
        events,
      });
    });

    // club manager api
    app.get(
      "/club-manager-summary/:email",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const managerEmail = req.params.email;
        const clubs = await clubsCollection.find({ managerEmail }).toArray();
        const clubIds = clubs.map((c) => c._id.toString());
        const members = await membershipsCollection.countDocuments({
          clubId: { $in: clubIds },
        });
        const events = await eventsCollection.countDocuments({
          clubId: { $in: clubIds },
        });
        const payments = await paymentsCollecttion.countDocuments({
          clubId: { $in: clubIds },
        });

        res.send({
          clubs,
          members,
          events,
          payments,
        });
      }
    );

    // member overview
    app.get("/member-summary/:email", verifyFBToken, async (req, res) => {
      const userEmail = req.params.email;
      const clubsJoinedCount = await membershipsCollection.countDocuments({
        userEmail,
      });
      const eventsRegisteredCount =
        await eventRegistrationsCollection.countDocuments({ userEmail });
      const joinedClubs = await membershipsCollection
        .find({ userEmail })
        .toArray();
      const clubIds = joinedClubs.map((event) => event.clubId);

      const upcomingEvents = await eventsCollection
        .find({
          clubId: { $in: clubIds },
        })
        .toArray();

      res.send({
        clubsJoinedCount,
        eventsRegisteredCount,
        upcomingEvents,
      });
    });

    // member my-club
    app.get("/my-clubs/:email", verifyFBToken, async (req, res) => {
      const userEmail = req.params.email;
      const pipeline = [
        {
          $match: {
            userEmail: userEmail,
            status: "active",
          },
        },
        {
          $addFields: { clubId: { $toObjectId: "$clubId" } },
        },
        {
          $lookup: {
            from: "clubs",
            localField: "clubId",
            foreignField: "_id",
            as: "clubInfo",
          },
        },
        { $unwind: "$clubInfo" },
        {
          $project: {
            _id: 0,
            clubId: "$clubId",
            clubName: "$clubInfo.clubName",
            location: "$clubInfo.location",
            status: 1,
          },
        },
      ];
      const result = await membershipsCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // member my events
    app.get("/my-events/:email", verifyFBToken, async (req, res) => {
      const userEmail = req.params.email;
      const pipeline = [
        { $match: { userEmail } },
        {
          $addFields: { eventId: { $toObjectId: "$eventId" } },
        },

        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "eventInfo",
          },
        },
        { $unwind: "$eventInfo" },

        {
          $addFields: { clubId: { $toObjectId: "$eventInfo.clubId" } },
        },
        {
          $lookup: {
            from: "clubs",
            localField: "clubId",
            foreignField: "_id",
            as: "clubInfo",
          },
        },
        { $unwind: "$clubInfo" },

        {
          $project: {
            _id: 0,
            eventTitle: "$eventInfo.title",
            eventDate: "$eventInfo.date",
            eventStatus: "$status",
            clubName: "$clubInfo.clubName",
          },
        },
      ];

      const result = await eventRegistrationsCollection
        .aggregate(pipeline)
        .toArray();
      res.send(result);
    });

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

    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/users/:email/role", verifyFBToken, async (req, res) => {
      const { email } = req.params;
      const query = { email };
      const role = await usersCollection.findOne(query, {
        projection: { role: 1, _id: 0 },
      });
      res.send(role);
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const { role } = req.body;
        const updateRole = { $set: { role } };
        const result = await usersCollection.updateOne(query, updateRole);
        res.send(result);
      }
    );

    // clubs related apis
    app.get("/clubs", async (req, res) => {
      const query = {};
      const { managerEmail, status } = req.query;
      if (managerEmail) {
        query.managerEmail = managerEmail;
      }
      if (status) {
        query.status = status;
      }
      const clubs = await clubsCollection.find(query).toArray();
      res.send(clubs);
    });

    app.get("/clubs/:id", verifyFBToken, async (req, res) => {
      const club = await clubsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(club);
    });

    app.post("/clubs", verifyFBToken, verifyManager, async (req, res) => {
      const club = req.body;
      club.status = "pending";
      club.createdAt = new Date();
      const result = await clubsCollection.insertOne(club);
      res.send(result);
    });

    app.patch("/clubs/:id", verifyFBToken, verifyManager, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const update = { $set: data };
      const result = await clubsCollection.updateOne(query, update);
      res.send(result);
    });

    // For status update (Admin)
    app.patch(
      "/clubs/:id/status",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const query = { _id: new ObjectId(req.params.id) };
        const { status } = req.body;
        const updateStatus = { $set: { status } };
        const result = await clubsCollection.updateOne(query, updateStatus);
        res.send(result);
      }
    );

    // membership apis
    app.post("/memberships", verifyFBToken, async (req, res) => {
      const membership = req.body;
      membership.status = "active";
      membership.joinedAt = new Date();
      const existing = await membershipsCollection.findOne({
        userEmail: membership.userEmail,
        clubId: membership.clubId,
      });

      if (existing) {
        return res
          .status(400)
          .send({ message: "User is already a member of this club" });
      }
      const result = await membershipsCollection.insertOne(membership);
      res.send(result);
    });

    app.get("/memberships", verifyFBToken, async (req, res) => {
      const { userEmail, clubId } = req.query;
      const query = {};
      if (clubId) {
        query.clubId = clubId;
      }
      if (userEmail) {
        query.userEmail = userEmail;
      }
      const memberships = await membershipsCollection.find(query).toArray();
      res.send(memberships);
    });

    // For club manager
    app.patch("/memberships/:id/status", verifyFBToken, verifyManager, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const { status } = req.body;
      const updateStatus = { $set: { status } };
      const result = await membershipsCollection.updateOne(query, updateStatus);
      res.send(result);
    });

    // events related api -------->
    app.post("/events", verifyFBToken, verifyManager, async (req, res) => {
      const event = req.body;
      event.createdAt = new Date();
      const query = { _id: new ObjectId(event.clubId) };
      const club = await clubsCollection.findOne(query);
      if (!club || club.status !== "approved") {
        return res
          .status(403)
          .send({ message: "Cannot create event. Club is not approved." });
      }
      const result = await eventsCollection.insertOne(event);
      res.send(result);
    });

    app.get("/events", async (req, res) => {
      const { clubId } = req.query;
      const query = {};
      if (clubId) {
        query.clubId = clubId;
      }
      const events = await eventsCollection.find(query).toArray();
      res.send(events);
    });

    app.get("/events/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const events = await eventsCollection.find(query).toArray();
      res.send(events);
    });

    app.patch("/events/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const update = { $set: data };
      const result = await eventsCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/events/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await eventsCollection.deleteOne(query);
      res.send(result);
    });

    // eventRegistrations
    app.post("/eventRegistrations", async (req, res) => {
      const registration = req.body;
      registration.status = "registered";
      registration.registeredAt = new Date();
      const isRegistered = await eventRegistrationsCollection.findOne({
        userEmail: registration.userEmail,
      });
      if (isRegistered) {
        return res
          .status(400)
          .send({ message: "User already registered for this event" });
      }

      const membership = await membershipsCollection.findOne({
        userEmail,
        clubId: registration.clubId,
        status: "active",
      });
      if (!membership) {
        return res
          .status(403)
          .send({ message: "You must be a member of this club to register" });
      }
      const result = await eventRegistrationsCollection.insertOne(registration);
      res.send(result);
    });

    app.get("/eventRegistrations", async (req, res) => {
      const { userEmail, eventId } = req.query;
      const query = {};
      if (userEmail) {
        query.userEmail = userEmail;
      }
      if (eventId) {
        query.eventId = eventId;
      }
      const eventRegistrations = await eventRegistrationsCollection
        .find(query)
        .toArray();
      res.send(eventRegistrations);
    });

    app.get("/total-event-registration/:managerEmail", async (req, res) => {
      const { managerEmail } = req.params;

      const pipeline = [
        {
          $match: { managerEmail: managerEmail },
        },

        {
          $lookup: {
            from: "events",
            localField: "_id",
            foreignField: "clubId",
            as: "events",
          },
        },
        { $unwind: { path: "$events", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "eventRegistrations",
            localField: "events._id",
            foreignField: "eventId",
            as: "events.registrations",
          },
        },
        {
          $addFields: {
            "events.clubName": "$clubName",
          },
        },
        {
          $replaceWith: "$events",
        },
      ];

      const result = await clubsCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // payment related apis
    // Api for payment, stripe-chechkout-session
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = Math.round(Number(paymentInfo.membershipFee) * 100);
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.clubName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          clubId: paymentInfo.clubId,
          clubName: paymentInfo.clubName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
      });
      res.send({ url: session.url });
    });

    // api for retrive stripes data after payment
    app.post("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // prevent adding duplicate data into database
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentsCollecttion.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "Already Exist",
          transactionId,
        });
      }

      const existingMembership = await membershipsCollection.findOne({
        userEmail: session.customer_email,
        clubId: session.metadata.clubId,
      });

      if (session.payment_status === "paid" && !existingMembership) {
        const membership = {
          userEmail: session.customer_email,
          clubId: session.metadata.clubId,
          paymentId: session.payment_intent,
          status: "active",
          joinedAt: new Date(),
        };
        console.log(session);
        const membershipResult = await membershipsCollection.insertOne(
          membership
        );

        // Added to Payment collection afted payment
        const payment = {
          amount: session.amount_subtotal / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          clubId: session.metadata.clubId,
          clubName: session.metadata.clubName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentsCollecttion.insertOne(payment);
          res.send({
            success: true,
            transactionId: session.payment_intent,
            membership: membershipResult,
            paymentInfo: resultPayment,
          });
        }
      }
    });

    app.get("/payments", async (req, res) => {
      const query = {};
      const payments = await paymentsCollecttion.find(query).toArray();
      res.send(payments);
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
