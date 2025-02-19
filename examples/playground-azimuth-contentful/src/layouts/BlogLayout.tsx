// import { blog, post, config } from '.contentlayer/types'
import type { FC } from 'react'
import React from 'react'

import { BlogPostFooter } from '../components/BlogPostFooter'
import { Layout } from '../components/Layout'
import { Link, withPrefix } from '../utils'
import type { Blog, Config, Post } from '.contentlayer/types'

export const BlogLayout: FC<{ blog: Blog; config: Config; posts: Post[] }> = ({ blog, config, posts }) => (
  <Layout doc={blog} config={config}>
    <div className="outer">
      <div className="inner">
        <div className="grid post-feed">
          {posts
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((post, post_idx) => (
              <article key={post_idx} className="cell post">
                <div className="card">
                  {post.thumb_image && (
                    <Link className="post-thumbnail" href={withPrefix(post.url_path)}>
                      <img src={withPrefix(post.thumb_image)} alt={post.thumb_image_alt} />
                    </Link>
                  )}
                  <div className="post-body">
                    <header className="post-header">
                      <h2 className="post-title">
                        <Link href={withPrefix(post.url_path)}>{post.title}</Link>
                      </h2>
                    </header>
                    <div className="post-excerpt">
                      <p>{post.excerpt}</p>
                    </div>
                    <BlogPostFooter post={post} dateType="short" />
                  </div>
                </div>
              </article>
            ))}
        </div>
      </div>
    </div>
  </Layout>
)
