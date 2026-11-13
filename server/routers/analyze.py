"""POST /api/analyze: landmarks in, rep count + per-rep grades out."""

from fastapi import APIRouter

from analysis.squat import analyze_squat
from analysis.timeline import build_landmark_timeline
from schemas import AnalyzeRequest, AnalyzeResponse

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse, response_model_by_alias=True)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    timeline = build_landmark_timeline(request.frames)
    return analyze_squat(timeline, request.video_width, request.video_height)
