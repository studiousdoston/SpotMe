"""POST /api/analyze: landmarks in, rep count + per-rep grades out."""

from fastapi import APIRouter

from analysis.curl import analyze_curl
from analysis.pushup import analyze_pushup
from analysis.squat import analyze_squat
from analysis.timeline import build_landmark_timeline
from schemas import AnalyzeRequest, AnalyzeResponse

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse, response_model_by_alias=True)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    timeline = build_landmark_timeline(request.frames)
    # Each exercise has its own analysis and response shape (told apart by "exercise").
    if request.exercise == "curl":
        return analyze_curl(timeline, request.video_width, request.video_height)
    if request.exercise == "push_up":
        return analyze_pushup(timeline, request.video_width, request.video_height)
    return analyze_squat(timeline, request.video_width, request.video_height)
