import 'dotenv/config'
import * as joi from 'joi'
import * as ms from 'ms'

interface EnvVars {
    PORT: number
    BFF_WHATSAPP_SENDER_HOST: string
    BFF_WHATSAPP_SENDER_PORT: number
    DATABASE_URL: string
    JWT_SECRET: string
    JWT_EXPIRES_IN: ms.StringValue
}

const envSchema = joi.object({
    PORT: joi.number().required(),
    BFF_WHATSAPP_SENDER_HOST: joi.string().required(),
    BFF_WHATSAPP_SENDER_PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    JWT_SECRET: joi.string().required(),
    JWT_EXPIRES_IN: joi.string().default('7d')
}).unknown(true)

const { error, value } = envSchema.validate(process.env)

if(error){
    throw new Error(`Config validation error: ${error.message}`)
}

const envVars: EnvVars = value

export const envs: {
    port: number
    BFF_WHATSAPP_SENDER_HOST: string
    BFF_WHATSAPP_SENDER_PORT: number
    DATABASE_URL: string
    JWT_SECRET: string
    JWT_EXPIRES_IN: ms.StringValue
} = {
    port: envVars.PORT,
    BFF_WHATSAPP_SENDER_HOST: envVars.BFF_WHATSAPP_SENDER_HOST,
    BFF_WHATSAPP_SENDER_PORT: envVars.BFF_WHATSAPP_SENDER_PORT,
    DATABASE_URL: envVars.DATABASE_URL,
    JWT_SECRET: envVars.JWT_SECRET,
    JWT_EXPIRES_IN: envVars.JWT_EXPIRES_IN
}