import { NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize the Cloud Vision API client
const visionClient = new ImageAnnotatorClient();

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Remove the data URL prefix if it exists
    const base64Image = image.replace(/^data:image\/jpeg;base64,/, '');

    const visionRequest = {
      image: {
        content: base64Image,
      },
      features: [
        { type: 'FACE_DETECTION' },
      ],
    };

    // Perform face detection
    const [result] = await visionClient.faceDetection(visionRequest);
    const faces = result.faceAnnotations;

    if (!faces || faces.length === 0) {
      return NextResponse.json({ message: 'No faces detected' }, { status: 200 });
    }

    // Extract relevant data from the first detected face
    const face = faces[0];
    const emotions = {
      joy: face.joyLikelihood,
      sorrow: face.sorrowLikelihood,
      anger: face.angerLikelihood,
      surprise: face.surpriseLikelihood,
    };

    const landmarks = face.landmarks?.reduce((acc, landmark) => {
        if (landmark.type) {
            acc[landmark.type] = landmark.position;
        }
        return acc;
    }, {} as Record<string, any>) || {};

    // A simple eye contact estimation logic
    // This is a placeholder and can be refined.
    // It checks if the pupils are roughly centered horizontally within the eyes.
    const leftPupil = landmarks['LEFT_EYE_PUPIL'];
    const rightPupil = landmarks['RIGHT_EYE_PUPIL'];
    const leftEyeBoundary = landmarks['LEFT_EYE_LEFT_CORNER'] && landmarks['LEFT_EYE_RIGHT_CORNER'];
    const rightEyeBoundary = landmarks['RIGHT_EYE_LEFT_CORNER'] && landmarks['RIGHT_EYE_RIGHT_CORNER'];

    let eyeContact = false;
    if (leftPupil && leftEyeBoundary && rightPupil && rightEyeBoundary) {
        const leftPupilX = leftPupil.x || 0;
        const leftEyeCenterX = ((landmarks['LEFT_EYE_LEFT_CORNER'].x || 0) + (landmarks['LEFT_EYE_RIGHT_CORNER'].x || 0)) / 2;
        const rightPupilX = rightPupil.x || 0;
        const rightEyeCenterX = ((landmarks['RIGHT_EYE_LEFT_CORNER'].x || 0) + (landmarks['RIGHT_EYE_RIGHT_CORNER'].x || 0)) / 2;

        // Check if pupils are within a certain threshold of the eye's center
        const leftThreshold = Math.abs(leftPupilX - leftEyeCenterX);
        const rightThreshold = Math.abs(rightPupilX - rightEyeCenterX);

        // A smaller threshold indicates better eye contact
        if (leftThreshold < 2.0 && rightThreshold < 2.0) {
            eyeContact = true;
        }
    }

    return NextResponse.json({
      success: true,
      emotions,
      landmarks,
      eyeContact,
      detectionConfidence: face.detectionConfidence,
    });

  } catch (error) {
    console.error('Error in Vision API:', error);
    return NextResponse.json({ error: 'Failed to analyze frame' }, { status: 500 });
  }
}
