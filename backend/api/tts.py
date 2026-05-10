import os
import io
import azure.cognitiveservices.speech as speechsdk
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

class TTSRequest(BaseModel):
    text: str
    voice: str = "en-US-AriaNeural"  # Default highly professional voice

@router.post("/tts")
async def generate_tts(request: TTSRequest):
    speech_key = os.getenv("AZURE_SPEECH_KEY")
    service_region = os.getenv("AZURE_SPEECH_REGION")

    if not speech_key or not service_region:
        print("Warning: AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not set. TTS is disabled.")
        raise HTTPException(status_code=503, detail="TTS Service is currently unavailable due to missing credentials.")

    try:
        # Configure speech service
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=service_region)
        speech_config.speech_synthesis_voice_name = request.voice
        
        # Set output format to standard mp3 for browser compatibility
        speech_config.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3)

        # Use PullAudioOutputStream to get the raw audio binary data without writing to disk
        pull_stream = speechsdk.audio.PullAudioOutputStream()
        audio_config = speechsdk.audio.AudioOutputConfig(stream=pull_stream)
        
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)
        
        # Perform synthesis synchronously (it's fast enough for short sentences)
        result = synthesizer.speak_text_async(request.text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            # We must read from the pull_stream, or just use result.audio_data
            audio_data = result.audio_data
            if audio_data:
                return Response(content=audio_data, media_type="audio/mpeg")
            else:
                raise HTTPException(status_code=500, detail="Synthesized audio data is empty.")
                
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation_details = result.cancellation_details
            error_message = f"Speech synthesis canceled: {cancellation_details.reason}"
            if cancellation_details.reason == speechsdk.CancellationReason.Error:
                error_message += f"\nError details: {cancellation_details.error_details}"
            print(error_message)
            raise HTTPException(status_code=500, detail="Speech synthesis failed internally.")
            
    except Exception as e:
        print(f"TTS Exception: {e}")
        raise HTTPException(status_code=500, detail="Failed to synthesize speech.")
