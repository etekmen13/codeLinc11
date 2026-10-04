from fastapi import FastAPI

import onboarding

app = FastAPI()
app.include_router(onboarding.router)
