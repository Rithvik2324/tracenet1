require('dotenv').config();
const mongoose=require('mongoose');
const {TrackingEvent}=require('../models');
(async()=>{if(!process.env.MONGODB_URI)throw Error('MONGODB_URI is required');await mongoose.connect(process.env.MONGODB_URI);const rows=await TrackingEvent.find({eventType:'CHECKPOINT_SCAN'}).sort({createdAt:1}).lean();console.table(rows.map(({shipmentId,checkpoint,deviceId,createdAt,anchorStatus})=>({shipmentId,checkpoint,deviceId,createdAt,anchorStatus})));await mongoose.disconnect()})().catch(e=>{console.error(e.message);process.exitCode=1});
