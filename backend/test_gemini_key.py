import google.generativeai as genai
import sys

def test_gemini():
    api_key = "AIzaSyDFCYJl_WxeB-L14WN2azF3pV07puGqCTs"
    print(f"Testing with key: {api_key[:10]}...")
    
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content("Say hello")
        print("Success!")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {e}")

if __name__ == "__main__":
    test_gemini()
