import os
from groq import Groq
from llm.base import LLMProvider
from config import settings

class GroqProvider(LLMProvider):
    def __init__(self):
        if not settings.GROQ_API_KEY:
            print("WARNING: GROQ_API_KEY not found in config.")
        
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = "llama-3.1-8b-instant"

    async def generate_question(self, prompt: str, max_tokens: int = 1500) -> str:
        try:
            # Final safety: strip non-printable characters that might crash the connection
            clean_prompt = "".join(char for char in prompt if char.isprintable() or char in "\n\r\t")
            prompt_preview = clean_prompt[:1200]
            
            if settings.DEBUG:
                print("\n" + "="*50)
                print("DEBUG: AUTHORITATIVE PROMPT SENT TO GROQ")
                print("="*50)
                print(f"Prompt length: {len(clean_prompt)} chars")
                print(prompt_preview)
                if len(clean_prompt) > len(prompt_preview):
                    print("... [truncated debug prompt output]")
                print("="*50 + "\n")

            response = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": clean_prompt,
                    }
                ],
                model=self.model,
                temperature=0.7,
                max_tokens=max_tokens,
            )
            
            content = response.choices[0].message.content
            content_preview = (content or "")[:1200]
            
            if settings.DEBUG:
                print("\n" + "="*50)
                print("DEBUG: RAW RESPONSE FROM GROQ")
                print("="*50)
                print(f"Response length: {len(content or '')} chars")
                print(content_preview)
                if content and len(content) > len(content_preview):
                    print("... [truncated debug response output]")
                print("="*50 + "\n")
            
            return content.strip()
            
        except Exception as e:
            if settings.DEBUG:
                print(f"Groq Error: {e}")
            raise e
