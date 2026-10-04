from fastapi import FastAPI

import care_plan
import care_plan_api
import cdt_mapper
import onboarding
import provider
import simulation_api

app = FastAPI()
app.include_router(onboarding.router)
app.include_router(provider.router)
app.include_router(care_plan_api.router)
app.include_router(care_plan.router)
app.include_router(cdt_mapper.router)
app.include_router(simulation_api.router)
