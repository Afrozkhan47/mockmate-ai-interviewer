from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    async def generate_question(self, prompt: str, max_tokens: int = 1500) -> str:
        """
        Generates a standardized interview question based on a single merged prompt.
        
        Args:
            prompt: The full authoritative prompt string.
            max_tokens: Maximum tokens to generate (default 1500 to protect Groq limits).
            
        Returns:
            str: The generated question text.
        """
        pass
