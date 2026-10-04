from fastapi import FastAPI

import onboarding
import provider

app = FastAPI()
app.include_router(onboarding.router)
app.include_router(provider.router)
