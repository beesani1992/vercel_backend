import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai'; // Importing the SDK
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
// Enable explicit CORS configuration
app.use(cors({
  origin: 'https://vercel-frontend-lemon-iota.vercel.app', //replace with your frontend URL)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Handle HTTP OPTIONS preflight requests globally
app.options('*', cors());
app.use(express.json());

// Save uploaded files to Vercel's temporary directory
const upload = multer({ dest: '/tmp/' });

// 🔥 FIXED INITIALIZATION: In the @google/genai SDK, you pass the key directly inside the options object
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/process-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    console.error('❌ No file received by the backend server.');
    return res.status(400).json({ error: 'Please upload a valid video file.' });
  }

  const localFilePath = req.file.path;

  try {
    console.log('------------------------------------');
    console.log('📦 Inbound File Data Logged:');
    console.log(`Original Name: ${req.file.originalname}`);
    
    let finalMimeType = req.file.mimetype;
    if (!finalMimeType || finalMimeType === 'application/octet-stream') {
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      if (fileExtension === '.mp4') finalMimeType = 'video/mp4';
      else if (fileExtension === '.mov') finalMimeType = 'video/quicktime';
      else finalMimeType = 'video/mp4';
    }

    console.log(`🚀 Using MimeType: "${finalMimeType}"`);
    console.log('------------------------------------');
    console.log('Sending video payload to Gemini File API...');

    // 1. Upload video using the corrected SDK configuration structure
    let mediaFile = await ai.files.upload({
      file: localFilePath,
      mimeType: finalMimeType, // Some SDK versions look for it here...
      config: {
        mimeType: finalMimeType  // ...while others require it explicitly inside a config object!
      }
    });

    console.log(`🎉 Gemini Storage Accepted Upload! File Token: ${mediaFile.name}`);

    // 2. Poll the API until Gemini has finished indexing/processing the video
    let fileStatus = await ai.files.get({ name: mediaFile.name });
    while (fileStatus.state === 'PROCESSING') {
      console.log('⏳ Gemini is processing video segments...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      fileStatus = await ai.files.get({ name: mediaFile.name });
    }

    if (fileStatus.state === 'FAILED') {
      throw new Error('Gemini File API internal processing failed.');
    }

    console.log('✅ Video analysis ready. Prompting model...');

    // 3. Command Gemini to break the video down into cartoon prompts
    console.log('✅ Video analysis ready. Prompting model...');

    // 3. Command Gemini using ONLY the clean file object reference
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          fileData: {
            fileUri: fileStatus.uri,
            mimeType: fileStatus.mimeType
          }
        },
        {
          text: `Analyze this video meticulously frame-by-frame. Your task is to extract the visual data and return a structured breakdown designed for photorealistic AI video generation.
              Please provide your output in the following three sections:
              1. Scene Script: Provide a chronological, timestamped breakdown (e.g., 0:00 - 0:01, 0:01 - 0:02) detailing every key event, micro-expression, gesture, gaze shift, and pose change of the main subject.
              2. Master Character Image Prompt: Create a highly descriptive prompt to generate a hyper-realistic, lifelike digital avatar base frame. Describe the subject's exact physical appearance, hair, clothing, jewelry, and the background environment. Use photography keywords like 'ultra-photorealistic', '8k resolution', 'cinematic lighting', and '85mm lens'.
              3. Master Video Generation Prompt: Create a single, comprehensive prompt that combines the physical description of the avatar and environment with the exact second-by-second Scene Script you generated in step 1. Instruct the video generator to focus on 'fluid realistic human motion', 'natural skin textures', and 'high temporal consistency.
              4. Voice Transcription & Translation: Listen to the actual audio track of the video. Transcribe the original spoken dialogue exactly as it occurs, mapped accurately to the timestamps (e.g., 0:00 - 0:02). Capture the emotional tone of the delivery in brackets (e.g., [Excited], [Annoyed]). Then, provide the exact meaning of that original audio in one of the distinct variations:
              - Hindi (written in standard Devanagari or Romanized Hindi)
              - Hinglish (a natural conversational blend of Hindi and English)
              - Indian English (English utilizing natural Indian conversational phrasing and syntax)`,
            },
      ],
    });

    // 4. Clean up both environments
    fs.unlinkSync(localFilePath);
    await ai.files.delete({ name: mediaFile.name });

    res.json({
      success: true,
      cartoonBlueprint: response.text,
    });

  } catch (error) {
    console.error('❌ Backend pipeline error:', error.message);
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    res.status(500).json({ error: error.message });
  }
});

// At the end of backend/server.js
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

export default app; // Required for Vercel Serverless Function routing
