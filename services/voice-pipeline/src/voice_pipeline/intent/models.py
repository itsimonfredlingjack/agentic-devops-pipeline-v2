"""Pydantic v2 models for task intent extraction output."""

from pydantic import BaseModel, Field, model_validator


class TaskIntent(BaseModel):
    """Extracted intent for a task draft.

    Produced by the LLM from transcribed voice input.
    """

    summary: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Short one-line task summary.",
        examples=["Bygg login-sida med Google OAuth"],
    )
    description: str = Field(
        default="",
        description="Detailed ticket description in plain text.",
    )
    acceptance_criteria: str = Field(
        default="",
        description="Gherkin-style acceptance criteria (Given/When/Then).",
        examples=[
            "Given an unauthenticated user\nWhen they click 'Sign in with Google'\nThen they are redirected to Google OAuth"
        ],
    )
    issue_type: str = Field(
        default="Story",
        description="Requested work type (Story, Bug, Task, Sub-task).",
        examples=["Story", "Bug", "Task"],
    )
    priority: str = Field(
        default="Medium",
        description="Requested priority (Highest, High, Medium, Low, Lowest).",
        examples=["High", "Medium", "Low"],
    )
    ambiguity_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="How ambiguous the request is (0.0 = clear, 1.0 = very ambiguous).",
    )
    clarification_questions: list[str] = Field(
        default_factory=list,
        description="Clarification questions when ambiguity_score > threshold.",
    )
    labels: list[str] = Field(
        default_factory=list,
        description="Labels to apply to the task record.",
    )

    @model_validator(mode="before")
    @classmethod
    def normalise_priority(cls, values: dict) -> dict:
        """Normalise priority to supported values."""
        valid = {"Highest", "High", "Medium", "Low", "Lowest"}
        priority = values.get("priority", "Medium")
        if priority not in valid:
            values["priority"] = "Medium"
        return values

    @model_validator(mode="before")
    @classmethod
    def normalise_issue_type(cls, values: dict) -> dict:
        """Normalise issue_type to supported values."""
        valid = {"Story", "Bug", "Task", "Sub-task", "Epic"}
        issue_type = values.get("issue_type", "Story")
        if issue_type not in valid:
            values["issue_type"] = "Story"
        return values


class AmbiguityResult(BaseModel):
    """Result when the intent is too ambiguous to create a task draft.

    Returned when ambiguity_score >= 0.7 and the LLM generates
    clarification questions instead of a full task intent.
    """

    questions: list[str] = Field(
        ...,
        min_length=1,
        description="List of clarification questions for the user.",
    )
    partial_summary: str = Field(
        default="",
        description="Partial summary extracted so far (may be empty).",
    )
    ambiguity_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Ambiguity score from the LLM.",
    )
