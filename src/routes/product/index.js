import express from 'express';
import { validateAuthToken } from '@src/middleware/authTokenValidator';
import { validateRequestValues } from '@src/middleware/requestValidator';
import { ApiResponse } from '@src/ApiResponse';
import { NotFoundException } from '@src/exception/CustomException';
import { sequelize } from '@src/model';
import * as productRepository from '@src/repository/productRepository';
import * as productLikeService from '@src/services/productLike/productLikeService';
import {
  productListResponse,
  productDetailResponse,
  toCommentResponse,
} from '@src/routes/product/dto/productResponse';

const router = express.Router();

/**
 * 중고 거래 물건을 등록하는 API
 */
router.post(
  '/api/v1/product',
  validateRequestValues('body', ['name', 'price', 'profileUrl', 'content']),
  validateAuthToken,
  (req, res, next) => {
    const { name, price, profileUrl, content, place } = req.body;
    const { memberId } = req;

    if (Number(price) < 0) {
      return res
        .status(400)
        .send(
          new ApiResponse(
            null,
            'VALIDATION_EXCEPTION',
            '가격은 0원 이상이어야 합니다'
          )
        );
    }

    sequelize
      .query(
        `INSERT INTO product(name, price, profile_url, content, place, sender_id) VALUES("${name}", ${price}, "${profileUrl}", "${content}", "${place}",${memberId})`
      )
      .then(() => {
        res.status(200).send(new ApiResponse('Ok'));
      })
      .catch((error) => {
        next(error);
      });
  }
);

/**
 * 모든 중고 거래 물건을 조회 하는 API
 */
router.get(
  '/api/v1/product/list',
  validateRequestValues('query', ['limit', 'offset']),
  validateAuthToken,
  async (req, res, next) => {
    try {
      const { offset, limit } = req.query;
      const keyword = req.query.keyword || '';
      const { memberId } = req;

      const countResponse = await productRepository.getCountOfProduct();
      const findProducts = await productRepository.findProductsPageableByKeword(
        keyword,
        limit,
        offset
      );
      const products = await Promise.all(
        findProducts[0].map(async (findProduct) => {
          return productListResponse(
            findProduct,
            await productLikeService.checkIsProductLike(
              findProduct.id,
              memberId
            )
          );
        })
      );

      res.status(200).send(
        new ApiResponse({
          page: {
            totalCount: countResponse[0][0].total_count,
            limit: limit,
            offset: offset,
          },
          products,
        })
      );
    } catch (error) {
      next(error);
    }
  }
);
/**
 * 특정 중고 거래 물건을 조회하는 API
 */
router.get(
  '/api/v1/product',
  validateRequestValues('query', ['productId']),
  async (req, res, next) => {
    try {
      const { productId } = req.query;
      const productResponse = await sequelize.query(
        `SELECT distinct 
         p.id as productId, p.name as productName, p.price, p.content, p.profile_url as productProfileUrl, p.place, p.is_sold, p.created_data_time,
         m.id as memberId, m.email, m.name as memberName, m.profile_url as memberProfileUrl 
         FROM product as p 
         INNER JOIN member as m 
         ON p.sender_id = m.id 
         WHERE p.id=${productId}`
      );
      _validateExistProduct(productResponse, productId);
      const comments = await sequelize.query(`SELECT distinct 
      c.id as commentId, c.product_id as productId, c.content, c.createdAt, c.updatedAt,
      m.id as memberId, m.email, m.name as memberName, m.profile_url as memberProfileUrl 
      FROM comment as c 
      INNER JOIN member as m 
      ON c.member_id = m.id 
      WHERE c.product_id=${productResponse[0][0].productId}`);
      const commentResponse = comments[0].map((comment) => {
        return toCommentResponse(comment);
      });
      res
        .status(200)
        .send(
          new ApiResponse(
            productDetailResponse(productResponse[0][0], commentResponse)
          )
        );
    } catch (error) {
      next(error);
    }
  }
);

const _validateExistProduct = (response, productId) => {
  if (response[0].length === 0) {
    throw new NotFoundException(
      '해당하는 id를 가진 상품은 존재하지 않습니다',
      productId
    );
  }
};

/**
 * 특정 중고 거래 물건을 삭제하는 API
 */
router.delete(
  '/api/v1/product',
  validateRequestValues('query', ['productId']),
  validateAuthToken,
  (req, res, next) => {
    const { productId } = req.query;
    const { memberId } = req;
    sequelize
      .query(
        `SELECT id FROM product WHERE id =${productId} AND sender_id=${memberId}`
      )
      .then((response) => {
        if (response[0].length === 0) {
          return res.status(404).send('해당 상품을 찾을 수 없어요');
        }
        sequelize
          .query(
            `DELETE FROM product WHERE id = ${productId} AND sender_id=${memberId}`
          )
          .then(() => {
            res.status(200).send(new ApiResponse('OK'));
          })
          .catch((error) => {
            next(error);
          });
      })
      .catch((error) => {
        next(error);
      });
  }
);

router.put('/api/v1/product/is_done', validateAuthToken, (req, res, next) => {
  const productId = req.body.productId;
  sequelize
    .query(
      `SELECT id FROM product WHERE id = ${productId} AND sender_id = ${req.memberId}`
    )
    .then((response) => {
      if (response[0].length == 0) {
        return res.status(404).send('없어! 돌아가');
      }
      sequelize
        .query(`UPDATE product SET is_sold = true WHERE id = ${productId}`)
        .then(() => {
          res.status(200).send(new ApiResponse('ooooookk'));
        })
        .catch((error) => {
          next(error);
        });
    })
    .catch((error) => {
      next(error);
    });
});

/**
 * 특정 중고 거래 물건을 수정하는 API
 */
router.put(
  '/api/v1/product',
  validateRequestValues('body', [
    'productId',
    'name',
    'price',
    'profileUrl',
    'content',
    'place',
  ]),
  validateAuthToken,
  (req, res, next) => {
    const { productId, name, price, profileUrl, content, place } = req.body;
    const { memberId } = req;
    sequelize
      .query(
        `SELECT * FROM product WHERE id = ${productId} AND sender_id=${memberId}`
      )
      .then((response) => {
        if (response[0].length === 0) {
          res.status(404).send('해당하는 상품은 존재하지 않습니다');
        }
        sequelize
          .query(
            `UPDATE product SET name="${name}", price=${price}, profile_url="${profileUrl}", content="${content}", place="${place}"
      WHERE id=${productId} AND sender_id=${memberId} AND is_sold=false`
          )
          .then(() => {
            res.status(200).send(new ApiResponse('수정 완료'));
          })
          .catch((error) => {
            next(error);
          });
      });
  }
);

export default router;
