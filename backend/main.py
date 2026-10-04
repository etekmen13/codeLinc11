import care_plan_api
import onboarding
import provider
from fastapi import FastAPI

app = FastAPI()
app.include_router(onboarding.router)
app.include_router(provider.router)
app.include_router(care_plan_api.router)
