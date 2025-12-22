const express = require("express");
const cors = require('cors');
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;
const stripe = require('stripe')(process.env.STRIPE);

const admin = require("firebase-admin");
const serviceAccount = require("./citypulse-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

function generateTrackingId() {
  const prefix = "CP";
  const date = new Date().toISOString().slice(0,10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}-${date}-${random}`;
}

app.use(cors());
app.use(express.json());

const verifyFbToken = async(req, res,next)=>{
  const token = req.headers.authorization;

  if(!token){
    return res.status(401).send({message: "unauthorize access"})
  }

  try{
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next()
  }
  catch(err){
    res.status(403).send({message:"unauthorize access"})
  }
  
}

const uri =`mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.3xhvrfl.mongodb.net/?appName=Cluster0` ;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run(){
    try{
        const db = client.db("City-Pulse-DB");
        const issuesCollection = db.collection("Issues");
        const userCollection = db.collection("users");
        const reviewsCollection = db.collection("Reviews");
        const paymentCollection = db.collection('payments');
        const staffCollection = db.collection('staffs');


        app.get("/users",verifyFbToken, async(req,res)=>{
          const cursor =  userCollection.find();
          const result = await cursor.toArray();
          res.send(result);
        })

        app.post('/users',async(req,res)=>{
          const user = req.body;
          user.role = 'user';
          user.createdAt = new Date();

          const result = await userCollection.insertOne(user);
          res.send(result);
        })

        app.patch("/users/:id", async(req,res)=>{
          const id = req.params.id;
          const roleInfo = req.body;
          const query ={_id: new ObjectId(id)}
          const updateDoc ={
            $set:{
              role:roleInfo.role
            }
          }
          const result = await userCollection.updateOne(query,updateDoc);
          res.send(result);
        })

        app.get('/staffs', async(req,res)=>{
          const query = {}
          if(req.query.status){
            query.status = req.query.status;
          }
          const cursor = staffCollection.find(query)
          const result = await cursor.toArray();
          res.send(result);
        })

        app.post("/staffs", async(req,res)=>{
          const staff = req.body;
          staff.status = "pending"
          staff.createdAt = new Date();
          
          const result =  await staffCollection.insertOne(staff);
          res.send(result);
        })

        app.patch('/staffs/:id', verifyFbToken, async(req,res)=>{
          const status = req.body.status;
          const id = req.params.id;
          const query ={_id : new ObjectId(id)}
          const updateDoc = {
            $set:{
              status: status,

            }
          }

          const result = await staffCollection.updateOne(query,updateDoc);
          res.send(result);

        })

        app.get("/issues",async(req,res)=>{
        const result = await issuesCollection.find().sort({priority:1}).toArray()
        res.send(result);  
        });

        app.get("/issues/:id", async(req,res)=>{
          const {id} = req.params
          const result = await issuesCollection.findOne({_id: new ObjectId(id)})
          res.send(result)
        });

        app.post("/issues", async(req,res)=>{
          const data = req.body
          const result = await issuesCollection.insertOne (data)
           res.send({
            success:true,
            result
           })
        });

         app.get("/my-issues",async(req,res)=>{
          const email = req.query.email;
          const result = await issuesCollection.find({email:email}).toArray();
          res.send(result);
        })

        app.get("/resolve-issues",async(req,res)=>{
        const result = await issuesCollection.find({status:"Resolved"}).sort({date:-1}).limit(6).toArray()
        res.send(result);  
        });

         app.get("/reviews",async(req,res)=>{
        const result = await reviewsCollection.find().toArray()
        res.send(result)  
        });

        app.put("/issues/:id",async(req,res)=>{
          const {id} = req.params;
          const data = req.body;
          const objectId = new ObjectId(id);
          const filter = {_id: objectId}
          const update = {
            $set : data,
          }
          const result = await issuesCollection.updateOne(filter,update)

          res.send(result)
        });


        app.delete("/issues/:id", async(req,res)=>{
          const {id} = req.params;
          const result = await issuesCollection.deleteOne({_id: new ObjectId(id)})
          res.send(result);
        });

      app.post('/create-checkout-session', async(req ,res)=>{
        const paymentInfo = req.body;
        const session = await stripe.checkout.sessions.create({
          line_items: [
      {
        price_data :{
          currency: "USD",
          unit_amount: 10000,
          product_data: {
            name: paymentInfo.issueName
          }
      
        },
        quantity: 1,
      }],
      customer_email:paymentInfo.senderEmail,
      mode: 'payment',
      metadata:{
        issueId : paymentInfo.issueId,
        issueName: paymentInfo.issueName,

      },

      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,

       });
      console.log(session);
      res.send({url: session.url});
      });

      app.patch('/payment-success', async(req ,res)=>{
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent;
        const query = {transactionId: transactionId}
        const paymentExist = await paymentCollection.findOne(query)
        if(paymentExist){
          return res.send({message: "Already exist ", transactionId})
        }

        const trackingId = generateTrackingId()
        if(session.payment_status === 'paid'){
          const id = session.metadata.issueId;
          const query = {_id: new ObjectId(id)}
          const update ={
            $set :{
              priority: 'High',
              trackingId: trackingId,
            }
          }
          const result = await issuesCollection.updateOne(query ,update);

          const payment = {
            amount : session.amount_total/100,
            currency: session.currency,
            customerEmail: session.customer_email,
            issueId: session.metadata.issueId,
            issueName: session.metadata.issueName,
            transactionId: session.payment_intent,
            paymentStatus: session.payment_status,
            paidAt: new Date(),
          }

          if(session.payment_status === "paid"){
              const resultPayment = await paymentCollection.insertOne(payment);
              res.send({success: true,
                 modifyIssue: result, 
                 paymentInfo: resultPayment,
                 trackingId:trackingId ,
                 transactionId:session.payment_intent
                })
          }

        }

        res.send({success: false})
      })

      app.get('/payments', verifyFbToken, async(req,res)=>{
        const email = req.query.email
        const query = {}

        if(email){
          query.customerEmail = email;

            if(email !== req.decoded_email){
              return res.status(403).send({message: 'forbidden access'})
            }
        }
        const cursor = paymentCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      })


    }
    finally{

    }
}

run().catch(console.dir);

app.get("/",(req,res)=>{
    res.send("Issue server is running now...");
})

app.listen(port,()=>{
    console.log("port:",port);
})