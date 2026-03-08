import 'dotenv/config'
import * as joi from 'joi'

interface EnvVars {
    PORT: number
    BFF_WHATSAPP_SENDER_HOST:string
    BFF_WHATSAPP_SENDER_PORT:number
}

const envSchema = joi.object({
    PORT: joi.number().required(),
    BFF_WHATSAPP_SENDER_HOST: joi.string().required(),
    BFF_WHATSAPP_SENDER_PORT: joi.number().required()
}).unknown(true)

const { error, value } = envSchema.validate(process.env)

if(error){
    throw new Error(`Config validation error: ${error.message}`)
}

const envVars: EnvVars = value

export const envs = {
    port: envVars.PORT,
    BFF_WHATSAPP_SENDER_HOST: envVars.BFF_WHATSAPP_SENDER_HOST,
    BFF_WHATSAPP_SENDER_PORT: envVars.BFF_WHATSAPP_SENDER_PORT
}