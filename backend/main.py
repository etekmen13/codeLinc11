from fastapi import FastAPI

import care_plan
import care_plan_api
import onboarding
import provider

app = FastAPI()
app.include_router(onboarding.router)
app.include_router(provider.router)
app.include_router(care_plan_api.router)
app.include_router(care_plan.router)
